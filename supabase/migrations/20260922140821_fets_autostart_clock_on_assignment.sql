-- The clock starts when the candidate sits down. Until now seating them and
-- starting their exam were two separate acts, and the second one was a form
-- with three fields -- so a lab with twenty-five seats had twenty-five forms to
-- fill in while people were already working. Assigning the seat now starts the
-- clock, and fets_adjust_exam remains for correcting it afterwards.

create or replace function public.fets_assign_workstation(p_candidate uuid, p_workstation uuid)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  w public.workstations;
  r public.schedule_rules;
  s public.exam_sessions;
  v_from public.candidate_stage;
  v_programme uuid;
  v_duration integer;
  v_started timestamptz := now();
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'lab_staff']::public.user_role[]);

  select * into w from public.workstations where id = p_workstation for update;
  if not found or w.center_id <> c.center_id then
    raise exception 'workstation not found at this center' using errcode = 'P0002';
  end if;

  if w.status = 'fault' then
    raise exception 'workstation % is marked faulty', w.seat_code using errcode = 'P0001';
  end if;

  if w.current_candidate_id is not null and w.current_candidate_id <> c.id then
    raise exception 'workstation % is already taken', w.seat_code using errcode = 'P0001';
  end if;

  update public.workstations set status = 'free', current_candidate_id = null
   where current_candidate_id = c.id and id <> p_workstation;

  v_from := c.status;

  -- Which exam, and for how long. The candidate's own programme wins; failing
  -- that, the one whose code appears in the day's exam name, which is how the
  -- roster is titled; failing that, the centre's default duration.
  v_programme := c.programme_id;

  if v_programme is null then
    select * into s from public.exam_sessions where id = c.exam_session_id;
    select id into v_programme
      from public.exam_programmes
     where center_id = c.center_id
       and active
       and coalesce(s.exam_name, '') ilike '%' || code || '%'
     order by length(code) desc
     limit 1;
  end if;

  select default_duration_minutes into v_duration
    from public.exam_programmes where id = v_programme;

  if v_duration is null then
    select * into r from public.schedule_rules where center_id = c.center_id;
    v_duration := coalesce(r.exam_duration_minutes, 180);
  end if;

  if c.exam_started_at is null then
    update public.candidates
       set workstation_id = p_workstation,
           programme_id = coalesce(v_programme, programme_id),
           exam_started_at = v_started,
           exam_duration_minutes = v_duration,
           exam_expected_end = v_started + make_interval(mins => v_duration),
           lab_entry_at = coalesce(lab_entry_at, v_started),
           testing_started_at = coalesce(testing_started_at, v_started),
           status = 'testing'
     where id = p_candidate
    returning * into c;

    update public.workstations set status = 'active', current_candidate_id = c.id
     where id = p_workstation;

    perform public.fets_log_event(c.id, c.center_id, 'candidate.assigned', v_from, c.status, null,
      jsonb_build_object('seat', w.seat_code));
    perform public.fets_log_event(c.id, c.center_id, 'exam.started', 'testing', 'testing',
      'clock started on seating',
      jsonb_build_object('started_at', v_started, 'duration_minutes', v_duration,
                         'programme', (select code from public.exam_programmes where id = v_programme)));
  else
    -- Moving somebody who is already running to another seat must not restart
    -- their clock.
    update public.candidates set workstation_id = p_workstation where id = p_candidate
    returning * into c;

    update public.workstations set status = 'active', current_candidate_id = c.id
     where id = p_workstation;

    perform public.fets_log_event(c.id, c.center_id, 'candidate.assigned', v_from, c.status,
      'moved seat', jsonb_build_object('seat', w.seat_code));
  end if;

  return c;
end;
$fn$;
