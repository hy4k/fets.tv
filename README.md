# FETS.TV

Next.js + TypeScript + Supabase starter for the CBT center operations console.

## Implemented

- Screenshot-aligned dark console UI with compact left rail.
- Supabase email/password staff login.
- Front Office roster search, ID verification, locker key, and check-in controls.
- Database-backed candidate workflow transitions through `transition_candidate(...)`.
- Immutable `candidate_events` audit trail.
- CSV/XLSX roster import API with header detection, whitespace normalization, source-row preservation, NO SHOW detection, and privacy-safe public tokens.
- Admin Room queue with `Call` action.
- Public Display route at `/display/[displayKey]` with token-only content and Supabase Realtime subscription.
- Exam Lab workstation view.
- Center Setup controls persisted to `schedule_rules`.

## Setup

The connected Supabase project is `ueufcqmdqtwvhjjyudeu` in `ap-south-1`.

Already applied and seeded:

- Site `4960 · Calicut`
- CMA US September 2026 exam session for `2026-09-15`
- Scheduling rules: 15-minute intervals, 90-minute duration, 3 labs, 20 seats per lab, 13:00 break
- 60 workstations across LAB A, LAB B, and LAB C
- RLS, realtime publication, candidate transition function, roster-write policies, and anonymous-access hardening

Completed live setup:

- `mithun@orchestrio.in` assigned the `admin` role for Site 4960.
- `public.centers` RLS enabled with authenticated center-scoped reads.
- Attached CMA roster imported: 55 candidates, 1 NO SHOW, 1 missing PART warning, 11 missing PLACE warnings.
- Candidates received privacy-safe tokens `FETS-001` through `FETS-055`.

Remaining local setup:

1. Copy `.env.example` to `.env.local` if moving this project outside the current workspace. A working `.env.local` has already been prepared for the connected project in this workspace.
2. Install dependencies and run the development server:

```bash
npm install
npm run dev
```

## Routes

- `/login` — staff authentication
- `/front` — Front Office
- `/admin` — Admin Room
- `/display/hall-1-main` — privacy-safe public display
- `/roster` — roster import and validation entry point
- `/lab` — workstation and handoff view
- `/setup` — scheduling and workflow settings

## Realtime flow

1. Front Office calls the `transition_candidate` database function.
2. The candidate row and `candidate_events` record update in PostgreSQL.
3. Admin Room receives candidate changes via Supabase Realtime.
4. Admin Room inserts a safe `public_display_calls` record when `Call` is pressed.
5. Public Display subscribes only to `public_display_calls` and receives token, instruction, hall, and timestamp.
6. Candidate name, phone, place, and roster fields are never sent to the public display route.

## Important production hardening

- Replace the default public display key with a random per-display key and allowlist it server-side.
- Add an authenticated server route for display-call creation instead of trusting a client-supplied center ID.
- Add strict transition ordering checks to prevent invalid backward jumps.
- Add role-aware UI guards and server-side audit review.
- Add a session selector rather than relying on a single environment variable.
- Add import preview/commit as two separate database operations before using this in production.
