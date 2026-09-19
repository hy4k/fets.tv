-- Floor actions. Reaching the expected end never finishes anyone: only
-- fets_confirm_finish does, and a person has to press it.

create or replace function public.fets_start_exam(
  p_candidate uuid,
  p_programme uuid,
  p_started_at timestamptz,
  p_duration integer
)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  v_from public.candidate_stage;
  v_prog public.exam_programmes;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'lab_staff']::public.user_role[]);

  if c.workstation_id is null then
    raise exception 'assign a workstation before starting the exam' using errcode = 'P0001';
  end if;

  if c.status not in ('assigned', 'lab_entry', 'testing') then
    raise exception 'the candidate is not at a workstation yet (status is %)', c.status using errcode = 'P0001';
  end if;

  if c.exam_started_at is not null then
    raise exception 'this exam has already been started; use the correction action instead' using errcode = 'P0001';
  end if;

  if p_duration is null or p_duration < 1 or p_duration > 1440 then
    raise exception 'enter a duration between 1 and 1440 minutes' using errcode = 'P0001';
  end if;

  if p_started_at > now() + interval '5 minutes' then
    raise exception 'the start time cannot be in the future' using errcode = 'P0001';
  end if;

  if p_programme is not null then
    select * into v_prog from public.exam_programmes where id = p_programme and center_id = c.center_id;
    if not found then raise exception 'unknown exam programme' using errcode = 'P0002'; end if;
  end if;

  v_from := c.status;

  update public.candidates
     set programme_id = coalesce(p_programme, programme_id),
         exam_started_at = p_started_at,
         exam_duration_minutes = p_duration,
         exam_expected_end = p_started_at + make_interval(mins => p_duration),
         testing_started_at = coalesce(testing_started_at, p_started_at),
         lab_entry_at = coalesce(lab_entry_at, p_started_at),
         status = 'testing'
   where id = p_candidate
  returning * into c;

  update public.workstations set status = 'active' where id = c.workstation_id;

  perform public.fets_log_event(c.id, c.center_id, 'exam.started', v_from, c.status, null,
    jsonb_build_object('started_at', p_started_at, 'duration_minutes', p_duration,
                       'programme', coalesce(v_prog.code, 'unspecified')));
  return c;
end;
$$;

-- Corrections keep the previous values in the audit event.
create or replace function public.fets_adjust_exam(
  p_candidate uuid,
  p_started_at timestamptz,
  p_duration integer,
  p_reason text
)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  v_old_start timestamptz;
  v_old_duration integer;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a correction needs a reason' using errcode = 'P0001';
  end if;

  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'lab_staff']::public.user_role[]);

  if c.exam_started_at is null then
    raise exception 'this exam has not been started yet' using errcode = 'P0001';
  end if;

  if p_duration is null or p_duration < 1 or p_duration > 1440 then
    raise exception 'enter a duration between 1 and 1440 minutes' using errcode = 'P0001';
  end if;

  v_old_start := c.exam_started_at;
  v_old_duration := c.exam_duration_minutes;

  update public.candidates
     set exam_started_at = p_started_at,
         exam_duration_minutes = p_duration,
         exam_expected_end = p_started_at + make_interval(mins => p_duration)
   where id = p_candidate
  returning * into c;

  perform public.fets_log_event(c.id, c.center_id, 'exam.time_corrected', c.status, c.status, p_reason,
    jsonb_build_object('previous_started_at', v_old_start, 'previous_duration_minutes', v_old_duration,
                       'started_at', p_started_at, 'duration_minutes', p_duration));
  return c;
end;
$$;

-- Break out. The exam clock keeps running; only the absence is timed.
create or replace function public.fets_break_out(
  p_candidate uuid,
  p_kind text default 'unscheduled',
  p_reason text default null
)
returns public.candidate_breaks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  b public.candidate_breaks;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  -- Any TCA on duty may authorise an unscheduled break.
  perform public.fets_guard(c.center_id, array['admin', 'lab_staff']::public.user_role[]);

  if p_kind not in ('scheduled', 'unscheduled') then
    raise exception 'break kind must be scheduled or unscheduled' using errcode = 'P0001';
  end if;

  if c.exam_started_at is null or c.exam_finished_at is not null then
    raise exception 'the candidate is not in an active exam' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.candidate_breaks where candidate_id = p_candidate and ended_at is null) then
    raise exception 'this candidate is already out on a break' using errcode = 'P0001';
  end if;

  insert into public.candidate_breaks (candidate_id, center_id, kind, authorised_by, reason)
  values (p_candidate, c.center_id, p_kind, auth.uid(), p_reason)
  returning * into b;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.break_out', c.status, c.status, p_reason,
    jsonb_build_object('kind', p_kind, 'exam_clock', 'running'));
  return b;
end;
$$;

create or replace function public.fets_break_in(p_candidate uuid)
returns public.candidate_breaks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  b public.candidate_breaks;
begin
  select * into c from public.candidates where id = p_candidate;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'lab_staff']::public.user_role[]);

  update public.candidate_breaks
     set ended_at = now()
   where candidate_id = p_candidate and ended_at is null
  returning * into b;

  if not found then
    raise exception 'this candidate is not currently out on a break' using errcode = 'P0001';
  end if;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.break_in', c.status, c.status, null,
    jsonb_build_object('kind', b.kind,
                       'away_seconds', extract(epoch from (b.ended_at - b.started_at))::integer));
  return b;
end;
$$;

-- The only way an exam ends. Never called automatically.
create or replace function public.fets_confirm_finish(p_candidate uuid, p_note text default null)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  v_from public.candidate_stage;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'lab_staff']::public.user_role[]);

  if c.exam_started_at is null then
    raise exception 'this exam was never started' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.candidate_breaks where candidate_id = p_candidate and ended_at is null) then
    raise exception 'bring the candidate back from their break first' using errcode = 'P0001';
  end if;

  v_from := c.status;

  update public.candidates
     set exam_finished_at = now(),
         completed_at = coalesce(completed_at, now()),
         status = 'completed',
         workstation_id = null
   where id = p_candidate
  returning * into c;

  update public.workstations set status = 'free', current_candidate_id = null
   where current_candidate_id = p_candidate;

  perform public.fets_log_event(c.id, c.center_id, 'exam.finished', v_from, c.status, p_note,
    jsonb_build_object('overran_expected_end', now() > c.exam_expected_end));
  return c;
end;
$$;

revoke all on function
  public.fets_start_exam(uuid, uuid, timestamptz, integer),
  public.fets_adjust_exam(uuid, timestamptz, integer, text),
  public.fets_break_out(uuid, text, text),
  public.fets_break_in(uuid),
  public.fets_confirm_finish(uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.fets_start_exam(uuid, uuid, timestamptz, integer),
  public.fets_adjust_exam(uuid, timestamptz, integer, text),
  public.fets_break_out(uuid, text, text),
  public.fets_break_in(uuid),
  public.fets_confirm_finish(uuid, text)
  to authenticated;
