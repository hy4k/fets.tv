-- Moving somebody mid-exam, carrying their sitting with them.
--
-- A machine freezes an hour into a four-hour exam. The candidate has to finish,
-- on a different machine, without losing the hour they already sat -- and
-- without the minutes spent standing about counting against them either. That
-- is three separate facts (the clock continues, the lost time is given back,
-- the old machine is out of service) and one record of why, which is what makes
-- it different from simply seating somebody.

create or replace function public.fets_transfer_workstation(
  p_candidate uuid,
  p_to_workstation uuid,
  p_reason text,
  p_minutes_lost integer default 0,
  p_fault_old_seat boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  w_to public.workstations;
  w_from public.workstations;
  i public.incidents;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_lost integer := greatest(coalesce(p_minutes_lost, 0), 0);
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'tca', 'lab_staff']::public.user_role[]);

  if v_reason = '' then
    raise exception 'say why they are being moved' using errcode = 'P0001';
  end if;

  if v_lost > 1440 then
    raise exception 'that is more lost time than a day holds' using errcode = 'P0001';
  end if;

  if c.exam_started_at is null then
    raise exception 'they have not started yet -- seat them from the Lab instead'
      using errcode = 'P0001';
  end if;

  if c.exam_finished_at is not null then
    raise exception 'their exam is already finished' using errcode = 'P0001';
  end if;

  select * into w_to from public.workstations where id = p_to_workstation for update;
  if not found or w_to.center_id <> c.center_id then
    raise exception 'that workstation is not at this center' using errcode = 'P0002';
  end if;

  if w_to.id = c.workstation_id then
    raise exception 'they are already at that workstation' using errcode = 'P0001';
  end if;

  if w_to.status = 'fault' then
    raise exception 'workstation % is marked faulty', w_to.seat_code using errcode = 'P0001';
  end if;

  if w_to.current_candidate_id is not null then
    raise exception 'workstation % is already taken', w_to.seat_code using errcode = 'P0001';
  end if;

  select * into w_from from public.workstations where id = c.workstation_id for update;

  -- The old machine. Out of service by default, because the usual reason for
  -- moving somebody is that it stopped working, and a seat that quietly returns
  -- to the pool will be handed to the next candidate.
  if w_from.id is not null then
    update public.workstations
       set status = case when coalesce(p_fault_old_seat, true) then 'fault' else 'free' end,
           current_candidate_id = null
     where id = w_from.id;
  end if;

  update public.workstations
     set status = 'active', current_candidate_id = c.id
   where id = p_to_workstation;

  -- The clock keeps its original start -- they really did sit that hour -- and
  -- the expected end moves out by what they lost, so the time is given back at
  -- the end rather than taken off the front.
  update public.candidates
     set workstation_id = p_to_workstation,
         exam_expected_end = exam_expected_end + make_interval(mins => v_lost),
         exam_duration_minutes = exam_duration_minutes + v_lost
   where id = p_candidate
  returning * into c;

  -- Every transfer is an exception worth reporting, so it writes its own
  -- incident rather than relying on somebody also remembering to log one. It
  -- opens and closes in the same breath because the move is both the problem
  -- and what was done about it.
  insert into public.incidents
    (center_id, exam_session_id, kind, severity, summary, detail,
     candidate_id, workstation_id, started_at, resolved_at, resolution,
     minutes_lost, reportable, logged_by, resolved_by)
  values (
    c.center_id,
    c.exam_session_id,
    'workstation',
    case when v_lost >= 15 then 'major' else 'minor' end,
    format('%s moved from %s to %s',
           c.public_token,
           coalesce(w_from.seat_code, 'no seat'),
           w_to.seat_code),
    v_reason,
    c.id,
    coalesce(w_from.id, w_to.id),
    now(),
    now(),
    format('Moved to %s. %s minute(s) added to the clock.%s',
           w_to.seat_code,
           v_lost,
           case when coalesce(p_fault_old_seat, true) and w_from.id is not null
                then ' ' || w_from.seat_code || ' taken out of service.'
                else '' end),
    v_lost,
    v_lost > 0,
    auth.uid(),
    auth.uid()
  )
  returning * into i;

  perform public.fets_log_event(
    c.id, c.center_id, 'candidate.transferred', c.status, c.status, v_reason,
    jsonb_build_object(
      'from_seat', w_from.seat_code,
      'to_seat', w_to.seat_code,
      'minutes_added', v_lost,
      'old_seat_faulted', coalesce(p_fault_old_seat, true),
      'incident_id', i.id
    )
  );

  return jsonb_build_object(
    'from_seat', w_from.seat_code,
    'to_seat', w_to.seat_code,
    'minutes_added', v_lost,
    'new_expected_end', c.exam_expected_end,
    'incident_id', i.id
  );
end;
$fn$;

revoke all on function public.fets_transfer_workstation(uuid, uuid, text, integer, boolean)
  from public, anon, authenticated;

grant execute on function public.fets_transfer_workstation(uuid, uuid, text, integer, boolean)
  to authenticated;
