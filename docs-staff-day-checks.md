# Shared checks for variable staff-day plans

The Lab page and signed-report view read canonical checks from the published FETS Live staff-day plan. Checks can start before 08:00 and continue into the evening; their 10/6-minute cadence continues through staff changes and named break cover. Each successful save is visible in both sites with the actual actor, time and note. Slots due before activation are not counted as missed.

The authenticated same-origin API derives the verified email and centre from the Online session. It calls server-only v2 Live RPCs with existing private server credentials. The database checks real Live identity, centre membership, roster or named temporary cover, slot ownership and due time. Anonymous requests return 401. Failed/uncertain writes retain notes and pause recording until a successful refresh.

This branch is based on main f829428 and preserves its newer admin-room, Lab, TV and reporting features. Existing signed reports and historical local records are retained; the shared log is available separately. If no v2 plan is published, the backend reads the existing legacy published plan rather than inventing a timetable. No Online schema changes are required.

Validation: 187 Node tests, TypeScript, production Next.js build; isolated browser checks at 1440px, 393px and 320px verify owner-only recording, failed-save note retention, shared event visibility, unavailable/read-only handling and unpublished-day handling. No production checks are created by verification.

Deployment: scripts/releases/deploy-staff-day-checks.sh pins the currently inspected production image, reuses its runtime environment privately for Hostinger Compose interpolation, retains a rollback image and old static assets, preserves Nginx/ports/networks and verifies public assets and anonymous API rejection. The existing Hostinger temporary checkout has disappeared; the installed Compose file is preserved and resolved with the running environment instead of blank interpolation values.
