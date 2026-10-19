# Shared walks and DVR checks

The Lab page records completed checks against the published FETS Live Shift timetable. Walks remain every 10 minutes and DVR checks every 6 minutes, within the existing 90-minute rotations. A check belongs to the responsible person immediately before its due time: outgoing staff keep the final check of their rotation; named break cover and effective coverage amendments are respected.

Staff use the same verified email in both apps. The Online server validates the session, reads the staff profile's active centre and sends that trusted identity to a service-only Live RPC. The browser cannot select another actor or centre. FETS Live checks the active account, centre membership, current roster, published plan, recording window and report closure before accepting a check. No names are used to guess identities.

There is one canonical record in Live `centre_duty_events`, with its actual actor, timestamp and immutable event ID. Online uses a read-only snapshot of the same slots and events, refreshed every 10 seconds and after a save; The Shift already refreshes every 30 seconds and on focus. A network retry returns the existing matching event, so no duplicate, mirror or delayed second write is required. Errors preserve typed notes, mark the data as stale and pause recording until refresh succeeds.

The day log and CSV use exact recorded slots; they never count a nearby, early or missed check as completed. The Report page exposes a separate read-only shared check log. Existing signed exam reports and historical local `walkthroughs` remain unchanged. There is no automatic check completion, backfill, user creation or mapping.

## Database dependency

Apply `FETS.LIVE-v7.0/supabase/migrations/20261019185443_online_shift_checks.sql` to FETS Live `qqewusetilxxfvfkmsed` and its `20261019203847_online_check_provenance_policy.sql` follow-up before this app release. Online project `ueufcqmdqtwvhjjyudeu` needs no SQL changes. Existing `FETS_LIVE_SUPABASE_URL` and `FETS_LIVE_SUPABASE_KEY` remain server-only. This release does not change candidate-roster imports or their scheduler.

## Validation

184 Online tests pass, including nine new request/slot/export checks. The matching Live branch has 17 isolated PostgreSQL tests covering role isolation, verified/active accounts, branch separation, both intervals, exact changeovers, break cover, amendments, roster removal, retries, closure and reads of native Live checks. TypeScript, targeted ESLint and production build pass. Isolated browser journeys at 1440, 393 and 320 pixels verify owner controls, failed-save draft retention, shared event visibility, stale connection handling and missing-plan states, with no page errors or horizontal overflow. Fictional preview records never reach production.

## Operations

`scripts/releases/deploy-shared-checks.sh <reviewed-commit>` is pinned to the inspected Online predecessor image. It retains the previous image and private configuration, builds the exact source with the existing public frontend settings, tests the candidate, rechecks main/branch/container/configuration before cutover, replaces only Online, and compares every new public static asset. Failure after cutover restores the previous image. Runtime environment, ports, networks, restart policy and Nginx must match before and after.

A lead must publish the actual day plan in The Shift before staff can record. Staff without a matching verified Live account and centre access see an explicit message; accounts are not linked by display name.

Database bridge installed in FETS Live on 20 October 2026 IST. Read-only production checks matched all 432 due slots and owners across the three existing published plans. Seven of eight non-viewer Online staff accounts have a matching verified Live account and centre membership; the ninth account is a viewer. No production check records were created, and Live counts remained 17 auth users, nine plans, zero duty events and one report. Online schema and records were not changed.

Website deployed and verified on 20 October 2026 IST (19 October 22:04 UTC): commit `2b5a706b1f4fc871acdbaed1f3cf9899142940ae`, release `20261019T220306Z-shared-checks-2b5a706`. This includes main `8ca0fd4`, preserving candidate corrections and TV Channel. All 65 public assets/metadata matched the reviewed build; the homepage returned 200 and unauthenticated shared-check requests returned 401. Desktop/mobile production browser checks reached the login screen without page errors or overflow. Runtime environment, ports, networks, restart policy and Nginx were preserved; the Live frontend image is unchanged.

A read-only check from the VPS using its existing server credentials successfully retrieved today's shared snapshot for seven verified staff and correctly blocked the unmatched eighth staff account. Neither centre had today's plan published. Production write journeys were validated only in isolated tests, not by creating real completion records.

Rollback: `bash /opt/fets-online-releases/20261019T220306Z-shared-checks-2b5a706/rollback.sh`. The preceding running image (`sha256:d1b74f1fcfd80d9834d56147d3ddde62b2d2c91a52aa4fcfcdd4c31bee6dbae3`) and private configuration are retained with this release.
