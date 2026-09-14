# FETS.TV MVP implementation brief

## Prototype delivered

`fets-tv-prototype.html` is a standalone clickable prototype for Site 4960, Calicut. The redesigned default view is Front Office Check-In so the daily operating action appears first. Secondary views are opened from a compact drawer menu rather than being displayed all at once.

- Front Office: candidate search, ID verification, locker-key issuance, check-in, and the next-handoff timeline.
- Admin Room: one primary action to call the verified candidate.
- Public Display: large-format token-only waiting-room screen updated by the Admin Room call.
- Exam Lab: compact workstation readiness map.
- Roster: imported roster preview kept behind the menu.
- Center Settings: interval, lab capacity, break, exam duration, start/end time, kept behind the menu.

The main screen deliberately avoids showing all metrics and modules simultaneously. The operational sequence is always visible, while supporting information stays collapsed or behind the drawer.

The prototype uses roster-derived sample data and intentionally does not show names or phone numbers on the public display.

The prototype uses roster-derived sample data and intentionally does not show names or phone numbers on the public display.

## Operational workflow

`Scheduled → Arrived → Preliminary ID Checked In + Locker Key → Waiting Candidate → Frisking → Biometrics → Assigned to Workstation → Lab Entry → Testing → Completed → Sign Out`

Every transition should create an audit event with:

- candidate id
- previous status
- new status
- operator id and role
- timestamp
- location / destination
- optional note or exception reason

## Planned Next.js route structure

- `/admin` — Admin Room
- `/admin/roster` — Roster upload, validation, and schedule preview
- `/front-office` — Staff check-in and candidate lookup
- `/display/[displayKey]` — Public token-only TV display
- `/lab` — Workstation map and candidate handoffs
- `/settings/center` — Center scheduling and workflow settings

## Supabase data model

### centers
`id`, `site_code`, `name`, `timezone`, `active`

### users
Managed by Supabase Auth; application profile contains `center_id`, `role`, `display_name`.

Roles: `admin`, `front_office`, `lab_staff`, `viewer`.

### exam_sessions
`id`, `center_id`, `exam_date`, `exam_name`, `source_filename`, `status`, `created_by`

### candidates
`id`, `exam_session_id`, `source_row`, `roster_number`, `first_name`, `last_name`, `part`, `phone`, `place`, `roster_flag`, `public_token`, `status`, `scheduled_at`, `arrival_at`, `check_in_at`, `id_verified_at`, `locker_key`, `frisked_at`, `biometrics_at`, `workstation_id`, `lab_entry_at`, `testing_started_at`, `completed_at`, `signed_out_at`

### schedule_rules
`center_id`, `slot_interval_minutes`, `exam_duration_minutes`, `labs_count`, `lab_capacity`, `exam_start`, `exam_end`, `break_start`, `break_minutes`

### workstations
`id`, `center_id`, `lab_name`, `seat_code`, `status`, `current_candidate_id`

### candidate_events
`id`, `candidate_id`, `event_type`, `from_status`, `to_status`, `operator_id`, `occurred_at`, `note`, `metadata_json`

### public_displays
`id`, `center_id`, `display_key_hash`, `label`, `active`, `last_seen_at`

## Realtime events

Use Supabase Realtime broadcasts or Postgres changes for:

- `candidate.status_changed`
- `candidate.checked_in`
- `candidate.assigned`
- `candidate.lab_entered`
- `candidate.completed`
- `schedule.resequenced`
- `display.call_updated`
- `workstation.status_changed`

Public display subscriptions must receive only a safe projection: token, instruction, room label, and update timestamp. Never send candidate name, phone, place, or roster fields to the display client.

## Import rules

1. Accept `.csv` and `.xlsx`.
2. Detect the header row rather than assuming row 1.
3. Ignore blank rows and colored separator rows.
4. Normalize whitespace in names, parts, phone strings, and places.
5. Preserve the original source row number.
6. Validate required fields: roster number, first name, last name, and part where available.
7. Preserve source flags such as `NO SHOW` as an exception, not as a normal candidate stage.
8. Show a preview and validation errors before committing the import.
9. Generate stable public tokens per exam session, such as `FETS-014`.
10. Never expose raw phone numbers in the public display or URLs.

## MVP acceptance criteria

- A staff user can search an imported roster and move one candidate through the operational workflow.
- Admin Room updates without a page refresh after front-office or lab actions.
- Slot sequencing respects interval, break, duration, and lab capacity settings.
- The TV display updates with token-only instructions in real time.
- Every transition is auditable and reversible only by an admin override.
- The system handles late arrival, No Show, duplicate import, and workstation reassignment states.
