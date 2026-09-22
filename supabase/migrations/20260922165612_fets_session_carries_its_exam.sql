-- The day is one exam, and the exam decides how long the clock runs.
--
-- Until now the clock guessed: seating somebody looked for a programme code
-- inside the roster's title, which works for "CELPIP General" and fails for a
-- file called "Sept 22 morning". Choosing the exam when the roster is uploaded
-- makes it a fact rather than a guess, and it is the one thing on that page
-- that cannot be inferred from the file.

alter table public.exam_sessions
  add column if not exists programme_id uuid references public.exam_programmes(id);

create or replace function public.fets_import_roster(
  p_center uuid,
  p_exam_name text,
  p_exam_date date,
  p_filename text,
  p_rows jsonb,
  p_programme uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r public.schedule_rules;
  v_session uuid;
  v_row jsonb;
  v_roster text;
  v_seq integer := 0;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_slot_capacity integer;
  v_in_slot integer := 0;
  v_slot timestamptz;
  v_break_start timestamptz;
  v_break_end timestamptz;
  v_day_end timestamptz;
  v_status public.candidate_stage;
  v_tz text;
  v_duration integer;
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'no rows to import' using errcode = 'P0001';
  end if;

  select * into r from public.schedule_rules where center_id = p_center;
  if not found then raise exception 'set up the center schedule before importing' using errcode = 'P0002'; end if;

  if p_programme is not null then
    select default_duration_minutes into v_duration
      from public.exam_programmes where id = p_programme and center_id = p_center and active;
    if v_duration is null then
      raise exception 'that exam does not belong to this center' using errcode = 'P0002';
    end if;
  end if;

  update public.exam_sessions set status = 'closed'
   where center_id = p_center and status in ('draft', 'ready', 'live');

  -- The board picks the active call by centre, not by session, so a call left
  -- over from the list just closed would keep its candidate on the TV while the
  -- new list is loading.
  update public.public_display_calls set active = false
   where center_id = p_center and active;

  update public.candidates set called_at = null
   where center_id = p_center and called_at is not null;

  insert into public.exam_sessions
    (center_id, exam_date, exam_name, source_filename, status, created_by, programme_id)
  values (p_center, p_exam_date, p_exam_name, p_filename, 'live', auth.uid(), p_programme)
  returning id into v_session;

  -- How many can arrive in one slot. With an exam chosen, its own length drives
  -- the spacing rather than the centre's default.
  v_slot_capacity := greatest(
    1,
    ceil(
      (select coalesce(sum(l.capacity), r.labs_count * r.lab_capacity) from public.labs l where l.center_id = p_center)::numeric
      * r.slot_interval_minutes
      / greatest(coalesce(v_duration, r.exam_duration_minutes), 1)
    )::integer
  );

  select timezone into v_tz from public.centers where id = p_center;

  v_slot := (p_exam_date + r.exam_start) at time zone v_tz;
  v_break_start := (p_exam_date + coalesce(r.break_start, r.exam_end)) at time zone v_tz;
  v_break_end := v_break_start + make_interval(mins => r.break_minutes);
  v_day_end := (p_exam_date + r.exam_end) at time zone v_tz;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_roster := btrim(coalesce(v_row ->> 'roster_number', ''));
    if v_roster = '' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (select 1 from public.candidates where exam_session_id = v_session and roster_number = v_roster) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_in_slot >= v_slot_capacity then
      v_slot := v_slot + make_interval(mins => r.slot_interval_minutes);
      v_in_slot := 0;
    end if;

    if v_slot >= v_break_start and v_slot < v_break_end then
      v_slot := v_break_end;
      v_in_slot := 0;
    end if;

    v_seq := v_seq + 1;
    v_status := case
      when coalesce(v_row ->> 'roster_flag', '') ilike '%no show%' then 'no_show'
      else 'scheduled'
    end;

    insert into public.candidates (
      exam_session_id, center_id, source_row, roster_number, first_name, last_name,
      part, phone, place, roster_flag, public_token, status, scheduled_at, programme_id
    )
    values (
      v_session,
      p_center,
      nullif(v_row ->> 'source_row', '')::integer,
      v_roster,
      btrim(coalesce(v_row ->> 'first_name', '')),
      btrim(coalesce(v_row ->> 'last_name', '')),
      nullif(btrim(coalesce(v_row ->> 'part', '')), ''),
      nullif(btrim(coalesce(v_row ->> 'phone', '')), ''),
      nullif(btrim(coalesce(v_row ->> 'place', '')), ''),
      nullif(btrim(coalesce(v_row ->> 'roster_flag', '')), ''),
      'FETS-' || lpad(v_seq::text, 3, '0'),
      v_status,
      v_slot,
      p_programme
    );

    v_inserted := v_inserted + 1;
    if v_status <> 'no_show' then v_in_slot := v_in_slot + 1; end if;
  end loop;

  return jsonb_build_object(
    'exam_session_id', v_session,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'slot_capacity', v_slot_capacity,
    'overruns_end_time', v_slot > v_day_end
  );
end;
$fn$;

create or replace function public.fets_start_blank_session(
  p_center uuid,
  p_exam_name text,
  p_exam_date date,
  p_programme uuid default null
)
returns public.exam_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s public.exam_sessions;
  v_name text := btrim(coalesce(p_exam_name, ''));
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  if v_name = '' then
    raise exception 'the list needs a name' using errcode = 'P0001';
  end if;

  if p_programme is not null
     and not exists (select 1 from public.exam_programmes
                      where id = p_programme and center_id = p_center and active) then
    raise exception 'that exam does not belong to this center' using errcode = 'P0002';
  end if;

  update public.exam_sessions set status = 'closed'
   where center_id = p_center and status in ('draft', 'ready', 'live');

  update public.public_display_calls set active = false
   where center_id = p_center and active;

  update public.candidates set called_at = null
   where center_id = p_center and called_at is not null;

  insert into public.exam_sessions
    (center_id, exam_date, exam_name, source_filename, status, created_by, programme_id)
  values (p_center, p_exam_date, v_name, null, 'live', auth.uid(), p_programme)
  returning * into s;

  return s;
end;
$fn$;

-- Seating a candidate now asks the day which exam it is, before it resorts to
-- reading the roster's title.
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

  select * into s from public.exam_sessions where id = c.exam_session_id;

  -- The candidate's own exam, then the day's, then the roster's title, then the
  -- centre's default. The first two are stated; the third is a guess kept only
  -- for a day imported before the exam was chosen up front.
  v_programme := coalesce(c.programme_id, s.programme_id);

  if v_programme is null then
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

revoke all on function
  public.fets_import_roster(uuid, text, date, text, jsonb, uuid),
  public.fets_start_blank_session(uuid, text, date, uuid)
  from public, anon, authenticated;

grant execute on function
  public.fets_import_roster(uuid, text, date, text, jsonb, uuid),
  public.fets_start_blank_session(uuid, text, date, uuid)
  to authenticated;

-- The older shapes are replaced by the ones above; leaving them reachable would
-- let a caller import a day with no exam attached.
drop function if exists public.fets_import_roster(uuid, text, date, text, jsonb);
drop function if exists public.fets_start_blank_session(uuid, text, date);