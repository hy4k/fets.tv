# Shared walks and DVR checks

The Lab page records completed checks against the published FETS Live Shift timetable. Walks remain every 10 minutes and DVR checks every 6 minutes, within the existing 90-minute rotations. A check belongs to the responsible person immediately before its due time: outgoing staff keep the final check of their rotation; named break cover and effective coverage amendments are respected.

Staff use the same verified email in both apps. The Online server validates the session, reads the staff profile's active centre and sends that trusted identity to a service-only Live RPC. The browser cannot select another actor or centre. FETS Live checks the active account, centre membership, current roster, published plan, recording window and report closure before accepting a check. No names are used to guess identities.

There is one canonical record in Live `centre_duty_events`, with its actual actor, timestamp and immutable event ID. Online uses a read-only snapshot of the same slots and events, refreshed every 10 seconds and after a save; The Shift already refreshes every 30 seconds and on focus. A network retry returns the existing matching event, so no duplicate, mirror or delayed second write is required. Errors preserve typed notes, mark the data as stale and pause recording until refresh succeeds.

The day log and CSV use exact recorded slots; they never count a nearby, early or missed check as completed. The Report page exposes a separate read-only shared check log. Existing signed exam reports and historical local `walkthroughs` remain unchanged. There is no automatic check completion, backfill, user creation or mapping.

## Database dependency

Apply `FETS.LIVE-v7.0/supabase/migrations/20261019185443_online_shift_checks.sql` to FETS Live `qqewusetilxxfvfkmsed` before this app release. Online project `ueufcqmdqtwvhjjyudeu` needs no SQL changes. Existing `FETS_LIVE_SUPABASE_URL` and `FETS_LIVE_SUPABASE_KEY` remain server-only. This release does not change candidate-roster imports or their scheduler.

## Validation

173 Online tests pass, including nine new request/slot/export checks. The matching Live branch has 17 isolated PostgreSQL tests covering role isolation, verified/active accounts, branch separation, both intervals, exact changeovers, break cover, amendments, roster removal, retries, closure and reads of native Live checks. TypeScript, targeted ESLint and production build pass. Isolated browser journeys at 1440, 393 and 320 pixels verify owner controls, failed-save draft retention, shared event visibility, stale connection handling and missing-plan states, with no page errors or horizontal overflow. Fictional preview records never reach production.

## Operations

`scripts/releases/deploy-shared-checks.sh <reviewed-commit>` is pinned to the inspected Online predecessor image. It retains the previous image and private configuration, builds the exact source with the existing public frontend settings, tests the candidate, rechecks main/branch/container/configuration before cutover, replaces only Online, and compares every new public static asset. Failure after cutover restores the previous image. Runtime environment, ports, networks, restart policy and Nginx must match before and after.

A lead must publish the actual day plan in The Shift before staff can record. Staff without a matching verified Live account and centre access see an explicit message; accounts are not linked by display name.

Deployment status: prepared. Add the verified release, rollback path and production read-only checks after rollout.
