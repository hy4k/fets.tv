-- Two ways a day leaves the working screens, which are not the same thing.
--
-- Closing is what happens to a real day: the roster stops being today's, the
-- board goes quiet, and every candidate, event and break stays exactly where it
-- is so the day can be looked at again. Purging is for a rehearsal: it deletes
-- the lot, because demo data that lingers is worse than no data.

create or replace function public.fets_close_day(p_center uuid)
returns public.exam_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s public.exam_sessions;
  v_testing integer;
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  select * into s from public.exam_sessions
   where center_id = p_center and status in ('draft', 'ready', 'live')
   order by created_at desc limit 1;

  if not found then
    raise exception 'there is no open day to close' using errcode = 'P0002';
  end if;

  -- Somebody still at a workstation means the day is not over, whatever the
  -- clock says. Finishing them is a deliberate act on the Live Floor.
  select count(*) into v_testing
    from public.candidates
   where exam_session_id = s.id and exam_started_at is not null and exam_finished_at is null;

  if v_testing > 0 then
    raise exception '% candidate(s) are still sitting the exam', v_testing using errcode = 'P0001';
  end if;

  update public.exam_sessions set status = 'closed' where id = s.id returning * into s;

  update public.public_display_calls set active = false
   where center_id = p_center and active;

  update public.display_notices set active = false, cleared_at = now(), cleared_by = auth.uid()
   where center_id = p_center and active;

  update public.candidates set called_at = null
   where center_id = p_center and called_at is not null;

  -- Hand the seats back, but only the ones nobody is at.
  update public.workstations set status = 'free', current_candidate_id = null
   where center_id = p_center
     and current_candidate_id in (select id from public.candidates where exam_session_id = s.id);

  return s;
end;
$fn$;

/**
 * Deletes a day and everything under it, permanently.
 *
 * For a rehearsal or a demo, not for a day that happened. It refuses the open
 * day outright: ending a day is fets_close_day's job, and making the dangerous
 * function the convenient one is how real rosters get deleted by accident.
 */
create or replace function public.fets_purge_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s public.exam_sessions;
  v_candidates integer;
  v_events integer;
begin
  select * into s from public.exam_sessions where id = p_session;
  if not found then raise exception 'that day does not exist' using errcode = 'P0002'; end if;

  perform public.fets_guard(s.center_id, array['admin']::public.user_role[]);

  if s.status in ('draft', 'ready', 'live') then
    raise exception 'close the day before deleting it' using errcode = 'P0001';
  end if;

  select count(*) into v_candidates from public.candidates where exam_session_id = p_session;
  select count(*) into v_events from public.candidate_events e
   where e.candidate_id in (select id from public.candidates where exam_session_id = p_session);

  -- Let go of any seat still pointing at one of these candidates first, or the
  -- workstation's foreign key holds the delete.
  update public.workstations set status = 'free', current_candidate_id = null
   where current_candidate_id in (select id from public.candidates where exam_session_id = p_session);

  update public.public_display_calls set active = false, candidate_id = null
   where candidate_id in (select id from public.candidates where exam_session_id = p_session);

  delete from public.candidate_breaks
   where candidate_id in (select id from public.candidates where exam_session_id = p_session);

  delete from public.candidate_events
   where candidate_id in (select id from public.candidates where exam_session_id = p_session);

  delete from public.candidates where exam_session_id = p_session;
  delete from public.exam_sessions where id = p_session;

  return jsonb_build_object(
    'exam_name', s.exam_name,
    'exam_date', s.exam_date,
    'candidates_deleted', v_candidates,
    'events_deleted', v_events
  );
end;
$fn$;

revoke all on function
  public.fets_close_day(uuid),
  public.fets_purge_session(uuid)
  from public, anon, authenticated;

grant execute on function
  public.fets_close_day(uuid),
  public.fets_purge_session(uuid)
  to authenticated;
