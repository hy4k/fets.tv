# fets.live roster contract

The canonical roster is `public.candidates` in fets.live project qqewusetilxxfvfkmsed. This app reads the eleven agreed fields with the server-only FETS_LIVE_SUPABASE_KEY. Browser components receive counts/results, not that key.

`supabase/migrations/20260930180000_fets_live_roster_sync.sql` is applied to **fets.online project ueufcqmdqtwvhjjyudeu** (confirmed and verified on 1 October 2026). The new RPC is service-role-only; the Next route authenticates staff and derives their centre from their profile before invoking it. The old provider-only RPC is retained for compatibility but is no longer called by this UI.

The pull reads all providers for today's IST range, paginates both tables, validates registration IDs/names/exams/times, and checks calendar totals by provider/exam/start. Mismatching groups stop the pull. Calendar bookings with no candidate roster generate visible warnings. Unknown providers are not inferred from exam names.

Matching is `(existing day session, provider, roster_number)`; whole names are kept in `first_name` with an empty `last_name` to preserve the upstream name without splitting. Re-pulls update source details but never reset operational status, lockers, seats, clocks or check-in timestamps. Missing upstream candidates are retained. Legacy rows are adopted only when both ID and full name agree and the ID does not overlap providers. A previous day with active candidates blocks automatic day rollover.

Manual entry/upload links now go to fets.live Calendar. **Pulling is manual**: on Roster, staff pick any day from today onwards. Today becomes (or tops up) the live list; a later day is prepared as a draft list for that date and today is untouched. When that day comes, pulling it opens the prepared list. Past days cannot be pulled. The host timer still calls POST `/api/fets-live/roster/cron` with `Authorization: Bearer <FETS_ROSTER_CRON_SECRET>` at 06:00 IST, but the route only pulls when `FETS_ROSTER_AUTO=on` is set in the server environment; otherwise it answers `skipped` and does nothing. The migration and repeated production re-pulls have been verified. Keep the secret in the server environment; never in Git or a browser.

Validation: `npm test`, `npm run build`, targeted ESLint. The isolated database regression is `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/verify-live-roster.mjs`; it checks repeated pulls, status/locker preservation, provider ID overlap and denied authenticated execution. Production migration/first-pull status must be recorded in the deployment notes separately.

## Host timer installation

Set a random `FETS_ROSTER_CRON_SECRET` in the app's server environment and recreate the container. The runtime image includes `scripts/pull-live-roster.mjs`. Copy the two files in `ops/` to `/etc/systemd/system/`, then run `systemctl daemon-reload` and `systemctl start fets-roster-sync.service`. Confirm success with `journalctl -u fets-roster-sync.service` before `systemctl enable --now fets-roster-sync.timer`. The service executes Node inside `fets-tv-fets-tv-1`, using its existing environment; it does not require a second host copy of the secret. Failed requests exit nonzero and appear in the journal.

## Verified deployment, 1 October 2026

- Live release: `20261001T071240Z`, reported by `https://fets.online/release.json`. Source and rollback image are preserved under `/opt/fets-online-releases/20261001T071240Z` on the VPS. Its `override.yml` pins the reviewed image and adds the server cron secret through the private deployment environment file. Use this override for subsequent container recreation.
- 132 tests, production build, targeted lint and isolated database regressions passed. Repeated production pulls preserved all 22 candidate IDs and operational fields; Cochin matched 9 source candidates and Calicut retained its 13 existing candidates because fets.live had no roster rows for that day. This retained-record gap is returned as a warning. Missing source records never erase exam-day progress.
- Claude/Anthropic source candidates are correctly labelled PEARSON VUE after the owner's clarification. Their uploaded 10:15 start time is retained. Prometric remains the provider for CMA US. The fets.live database and upload preview now reject these known exam/provider mismatches.
- The old duplicate roster entry/upload links lead staff to the fets.live Calendar. The pull button remains available, and open consoles recheck every five minutes.
- `fets-roster-sync.timer` is enabled for 06:00 IST (00:30 UTC). A manual service execution succeeded; unauthorized POST cron requests return 401.
- Staff should upload the missing Calicut source roster to fets.live. Existing Calicut progress remains intact meanwhile.
