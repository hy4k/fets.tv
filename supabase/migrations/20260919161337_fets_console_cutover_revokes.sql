-- Cutover hardening. The previous UI needed both of these; the console does not
-- (roster import goes through fets_import_roster, and the TV is served by the
-- Next.js server with the service role).

-- 1. Candidates can no longer be written directly, so a status change cannot
--    happen without the transition function writing its audit event.
revoke insert, update, delete, truncate on public.candidates from authenticated, anon;
drop policy if exists staff_insert_candidates on public.candidates;
drop policy if exists staff_update_candidates on public.candidates;

-- 2. The call log is no longer readable with the public anon key, which was
--    exposing every centre's live call and its plaintext display key.
revoke all on public.public_display_calls from anon;
drop policy if exists display_public_read on public.public_display_calls;

-- Writes to the call log also belong to the functions now.
revoke insert, update, delete, truncate on public.public_display_calls from authenticated;
drop policy if exists staff_insert_display_calls on public.public_display_calls;

-- Same for the leftover blanket grants on the other operational tables: reads
-- stay, writes go through the functions or the admin-only policies.
revoke insert, delete, truncate on public.exam_sessions, public.workstations, public.centers, public.schedule_rules from authenticated;
revoke all on public.exam_sessions, public.workstations, public.centers, public.schedule_rules, public.profiles, public.candidate_events from anon;
