# fets.live roster contract

The canonical roster is `public.candidates` in fets.live project qqewusetilxxfvfkmsed. This app reads the eleven agreed fields with the server-only FETS_LIVE_SUPABASE_KEY. Browser components receive counts/results, not that key.

Apply `supabase/migrations/20260930180000_fets_live_roster_sync.sql` to **fets.online project ueufcqmdqtwvhjjyudeu** before deploying. The new RPC is service-role-only; the Next route authenticates staff and derives their centre from their profile before invoking it. The old provider-only RPC is retained for compatibility but is no longer called by this UI.

The pull reads all providers for today's IST range, paginates both tables, validates registration IDs/names/exams/times, and checks calendar totals by provider/exam/start. Mismatching groups stop the pull. Calendar bookings with no candidate roster generate visible warnings. Unknown providers are not inferred from exam names.

Matching is `(existing day session, provider, roster_number)`; whole names are kept in `first_name` with an empty `last_name` to preserve the upstream name without splitting. Re-pulls update source details but never reset operational status, lockers, seats, clocks or check-in timestamps. Missing upstream candidates are retained. Legacy rows are adopted only when both ID and full name agree and the ID does not overlap providers. A previous day with active candidates blocks automatic day rollover.

Manual entry/upload links now go to fets.live Calendar. Staff can pull again on Roster. Open consoles check every five minutes and surface failed checks once per distinct error. An optional host timer calls POST `/api/fets-live/roster/cron` with `Authorization: Bearer <FETS_ROSTER_CRON_SECRET>` at 06:00 IST; the route checks both active centres and returns per-centre results. Run this timer only after the migration and a successful live re-pull test. Keep the secret in the server environment; never in Git or a browser.

Validation: `npm test`, `npm run build`, targeted ESLint. The isolated database regression is `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/verify-live-roster.mjs`; it checks repeated pulls, status/locker preservation, provider ID overlap and denied authenticated execution. Production migration/first-pull status must be recorded in the deployment notes separately.

## Host timer installation (after live validation)

Set a random `FETS_ROSTER_CRON_SECRET` in the app's server `.env`, recreate the app, and put the same value in `/etc/fets-roster-sync.env` (root-owned, mode 600). Copy `scripts/pull-live-roster.mjs` to `/opt/fets-online-sync/` and the two files in `ops/` to `/etc/systemd/system/`. Run `systemctl daemon-reload`, then `systemctl start fets-roster-sync.service`. Confirm a successful result with `journalctl -u fets-roster-sync.service` before `systemctl enable --now fets-roster-sync.timer`. An unsuccessful run has a nonzero exit code and is visible in the service journal. This installer does not claim the timer is already enabled.


## Verification state, 1 October 2026

- 132 tests passed; production build and targeted lint passed. Live source reads work with the existing server key.
- The production fets.online database still lacks `fets_sync_live_roster`; the new release is saved on a review branch until its migration is applied.
- The built server denies anonymous staff pulls and cron calls (401). An authorized cron call reaches both centres and returns actionable errors rather than silently importing inconsistent data.
- Cochin on 1 October contains two Claude/Anthropic source records labelled PROMETRIC at 10:15, while the calendar has ANTHROPIC under PEARSON VUE at 08:00. Owner clarification is pending; these records were not silently reassigned or duplicated.
- Morning timer is prepared, not enabled. Two successful production re-pulls with stable candidate IDs/progress are still required before switching the UI and enabling it.
