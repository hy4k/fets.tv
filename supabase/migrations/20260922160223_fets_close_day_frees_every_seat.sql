-- Closing the day left a seat held: the release only covered candidates of the
-- day being closed, and a seat still pointing at somebody from an earlier
-- session stayed occupied for ever. When the day is over the floor is empty, so
-- every seat at the centre goes back -- except one marked faulty, which is a
-- fact about the machine rather than about today.
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

  update public.workstations set status = 'free', current_candidate_id = null
   where center_id = p_center and status <> 'fault';

  return s;
end;
$fn$;
