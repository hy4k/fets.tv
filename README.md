# FETS.TV — Operations Console

Exam delivery console for Forun Testing & Educational Services, Site 4960 (Calicut).
Served at `https://fets.online` (Traefik + Docker on Hostinger), backed by the
Supabase project `ueufcqmdqtwvhjjyudeu` in `ap-south-1`.

The console enforces one flow, in this order:

**Front Office** check-in (ID cross-verified → locker key → checked in) → **Admin Room**
presses Call → **public TV** shows the token → front office sends the candidate in →
**Exam Lab** moves them through frisking, biometrics, a workstation, testing and sign-out.
Once a candidate is seated, **Live Floor** runs the exam clock.

Every transition runs through a Postgres function that records the status change and its
audit event in the same commit, checks the operator's center and role, and enforces the
stage rule for that step. Moving a candidate backwards requires `fets_admin_override`
with a reason.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind v4, served at the site root (old `/tv/...` links redirect)
- Supabase: Postgres, Auth, Realtime, RLS
- `exceljs` + `papaparse` for roster import

## Roles

| Role | Can do |
| --- | --- |
| `admin` | Everything, including Setup, roster import, seat sync and the backwards-stage override |
| `tca` | The whole operational floor: front desk, Call / Re-call / Clear, seating, exam clock, breaks, Confirm finish. No Setup, no roster import, no override |
| `front_office` | Front desk only |
| `lab_staff` | Lab and floor only |
| `viewer` | Read only |

Jobs at the centers rotate daily, so most staff are `tca` rather than a fixed
desk. `fets_guard` treats a TCA as satisfying anything front office or lab staff
would satisfy; the three call actions name the TCA explicitly.

## Routes

The rail follows the working day from the top down — roster, candidates, front
office, admin room, lab, floor — so staff move down it as the day goes on and
never have to go back up.

| Route | Who | What |
| --- | --- | --- |
| `/login` | anyone | Staff sign-in |
| `/front-office` | front office, TCA | Search the roster, verify ID, issue a locker key, check in, send called candidates in |
| `/admin` | admin, TCA | Waiting queue with Call / Re-call / Clear, live counters, 11-stage flow, audit trail, override |
| `/tv` | any operator | Staff-side preview of what the halls are showing |
| `/notices` | admin, TCA | Hall Messages: put a templated message on the TV, with a live preview of the board |
| `/floor` | admin, TCA, lab staff | Live Floor: one card per occupied seat, exam countdown, breaks, Confirm finish |
| `/roster` | admin | Step 1: upload the day's roster. Nothing else on the page |
| `/candidates` | any operator | Step 2: the imported roster as a list, searchable and filterable |
| `/lab` | lab staff, TCA | Seat map, faults, handoffs through the pipeline |
| `/settings/center` | admin | Scheduling, workflow toggles, paired displays |
| `/display/<key>` | nobody signed in | The hall TV |

Paths are at the root in production (`fets.online/front-office`); old `/tv/...` links redirect there.

## Local setup

```bash
cp .env.example .env.local   # project URL, anon key, service role key
npm install
npm run dev                  # http://localhost:3000/front-office
```

Operators need a row in `profiles` pointing at their center:

```sql
insert into profiles (id, center_id, display_name, role)
values ('<auth user id>', '01610931-51f3-4391-a5c7-31bcd5ae4bfd', 'Name', 'admin');
```

Roles: `admin`, `front_office`, `lab_staff`, `viewer`. Only `admin` can call candidates to
the TV, import a roster, change center settings or run an override.

## Public displays

A TV opens `/display/<display key>`. The key is a shared secret that lives only in that
TV's URL; `public_displays` stores its SHA-256 hash. Register one with:

```sql
insert into public_displays (center_id, display_key_hash, label, hall_label)
values (
  '01610931-51f3-4391-a5c7-31bcd5ae4bfd',
  encode(sha256(convert_to('a-long-random-string', 'utf8')), 'hex'),
  'Hall 1 · main TV',
  'HALL 1'
);
```

The display client never talks to Postgres. The Next.js server validates the key,
subscribes to Realtime with the service role, and streams a safe projection over SSE —
token, room, instruction, and the name only when the center's `show_name_on_tv` is on.
Phone, place and roster number never leave the server. This is why the deployment needs
`SUPABASE_SERVICE_ROLE_KEY` as a runtime secret.

`show_name_on_tv` defaults to **on** so candidates can recognise their own name and walk in
unaided. Turn it off in Setup → Workflow for a token-only hall.

## Roster import

Accepts `.csv` and `.xlsx`, finds the header row rather than assuming row 1, skips blank
rows and one-cell separator bands, normalises whitespace and phone formats, keeps the
original row number, rejects duplicate roster numbers, and preserves `NO SHOW` as an
exception rather than a stage. Counts and per-row issues are shown before committing.
Committing closes the previous session and issues `FETS-001…` tokens in roster order,
scheduling candidates into slots that respect interval, duration, break and lab capacity.

## Hall messages

Staff put a message on the TV by picking a template and filling its one blank.
The wording is fixed and the final text is rendered by `fets_post_notice` in the
database, never accepted from the client, so the board can only ever speak in
the centre's own words — a caller that passes its own `body` is ignored. Slot
values are validated too: a `time` slot must be a 24-hour `HH:MM`, and nothing
with control characters or over 40 characters is accepted.

**A message never hides a call.** While someone is being called it sits in a
band beneath the call; when the board is idle it takes the whole screen. Tone
(`info`, `warning`, `urgent`) comes from the template and colours the band.

A message can be held until cleared, or expire on its own after 15, 30 or 60
minutes, so a board left running overnight cannot keep yesterday's notice up.
Templates live in `notice_templates`; ten are seeded and shared by all centres.

The Notices screen previews with the real `DisplayBoard` at the TV's aspect
ratio, so what staff approve is what the hall gets.

## Live Floor

Staff enter the actual start time and the duration; the countdown is derived from
`exam_started_at + exam_duration_minutes`, so it survives a refresh and reads the same on
every screen. Durations come from `exam_programmes`, edited once under Setup and
prefilled when an exam is started.

- Colour bands: green over an hour left, blue inside 60 minutes, red inside 15, blinking
  in the last minute, and `+mm min` once the expected end has passed.
- Reaching the expected end **never** finishes anyone. The card asks staff to confirm and
  `fets_confirm_finish` is the only thing that ends an exam.
- Breaks are timed separately and the exam clock keeps running through them. Scheduled
  breaks are one press; unscheduled ones ask for a reason and record who authorised them.
  Any TCA may authorise one. A candidate cannot be finished while still out.
- Corrections go through `fets_adjust_exam`, which requires a reason and keeps the
  previous start and duration in the audit event.

A time typed on the floor is read as the center's wall clock, not the browser's, so a
laptop with the wrong timezone cannot skew the record.

## Database

`supabase/migrations/0001…0006` are the original schema. `20260919*` add the console
bridge: `center_id` on candidates and events, `called_at`, `show_name_on_tv`, workflow
flags, the hashed-key `public_displays` table, name/room columns on the call log, and the
`fets_*` transition functions. The generic `transition_candidate` is kept for
compatibility and now checks the operator's center. The last two add the Live Floor:
`exam_programmes`, `candidate_breaks`, the exam-timing columns on `candidates`, and the
five floor functions.

Applied to production already. To rebuild elsewhere:

```bash
supabase db push
```

### Cutover

`20260919161337` revoked the leftover grants from the previous UI: `candidates` can no
longer be written directly (so no status change can skip its audit event) and
`public_display_calls` is no longer readable with the anon key. Staff still read the call
log through `staff_read_display_calls`, scoped to their own center; the hall TV is served
by the Next.js route with the service role, so the display client never touches Postgres.

## Checks

```bash
npm run build
npm run lint
npm test          # roster parser + exam clock
```

The SQL has been exercised end to end against Postgres 16 and against the live project in
a transaction that was rolled back: import → check-in → call → entered → lab pipeline,
plus the guard paths (wrong role, missing ID, duplicate locker key, cross-center access,
anon access).
