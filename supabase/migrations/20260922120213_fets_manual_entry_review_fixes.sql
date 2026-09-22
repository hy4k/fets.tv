-- Four things a review found in the manual-entry work, and one of them was
-- already there before it.

-- 1. Two operators adding a walk-in at the same moment both read the same
--    max(public_token), compute the same sequence, and the second insert fails
--    the (exam_session_id, public_token) unique constraint instead of adding
--    its candidate. Locking the session row first makes the two adds queue.
--
-- 2. Correcting a name while that candidate is on the TV left the board showing
--    the old one, because the call row carries its own snapshot of the name.
--
-- 3. Starting a new list -- by import or by hand -- left the previous list's
--    call active. The board resolves the active call by centre rather than by
--    session, so yesterday's candidate stayed on screen.

create or replace function public.fets_add_candidate(
  p_center uuid,
  p_first_name text,
  p_last_name text default '',
  p_part text default null,
  p_phone text default null,
  p_place text default null,
  p_roster_number text default null
)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  v_session uuid;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_roster text := nullif(btrim(coalesce(p_roster_number, '')), '');
  v_seq integer;
  v_slot timestamptz;
begin
  perform public.fets_guard(p_center, array['admin', 'tca', 'front_office']::public.user_role[]);

  if v_first = '' and v_last = '' then
    raise exception 'a candidate needs a name' using errcode = 'P0001';
  end if;

  select id into v_session
    from public.exam_sessions
   where center_id = p_center and status in ('draft', 'ready', 'live')
   order by created_at desc
   limit 1;

  if v_session is null then
    raise exception 'import a roster before adding a candidate' using errcode = 'P0002';
  end if;

  -- Hold the session while the next token is worked out. Without this, two
  -- desks adding a walk-in in the same second both read the same highest token
  -- and the second insert collides on the unique constraint.
  perform 1 from public.exam_sessions where id = v_session for update;

  -- The token is the candidate's public identity on the TV, so it continues the
  -- session's own run rather than restarting or colliding with an imported one.
  select coalesce(max(nullif(regexp_replace(public_token, '\D', '', 'g'), '')::integer), 0) + 1
    into v_seq
    from public.candidates
   where exam_session_id = v_session;

  -- A walk-in is here now, so it takes the last scheduled slot rather than a
  -- time earlier in the day that has already passed.
  select max(scheduled_at) into v_slot
    from public.candidates
   where exam_session_id = v_session;

  if v_roster is null then
    v_roster := 'MANUAL-' || lpad(v_seq::text, 3, '0');
  end if;

  if exists (
    select 1 from public.candidates
     where exam_session_id = v_session and roster_number = v_roster
  ) then
    raise exception 'that roster number is already on today''s list' using errcode = 'P0001';
  end if;

  insert into public.candidates (
    exam_session_id, center_id, roster_number, first_name, last_name,
    part, phone, place, public_token, status, scheduled_at
  )
  values (
    v_session,
    p_center,
    v_roster,
    v_first,
    v_last,
    nullif(btrim(coalesce(p_part, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_place, '')), ''),
    'FETS-' || lpad(v_seq::text, 3, '0'),
    'scheduled',
    coalesce(v_slot, now())
  )
  returning * into c;

  perform public.fets_log_event(
    c.id, p_center, 'candidate_added', 'scheduled', 'scheduled',
    'added by hand',
    jsonb_build_object('roster_number', c.roster_number, 'token', c.public_token)
  );

  return c;
end;
$fn$;

create or replace function public.fets_update_candidate_details(
  p_candidate uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_part text default null,
  p_phone text default null,
  p_place text default null
)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  v_changed text[] := '{}';
  v_show_name boolean;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'tca', 'front_office']::public.user_role[]);

  -- A null argument means "leave this alone"; an empty string means "clear it",
  -- which is how a wrong phone number gets removed rather than merely blanked
  -- in the form and silently kept.
  if p_first_name is not null or p_last_name is not null then
    if btrim(coalesce(p_first_name, c.first_name)) = ''
       and btrim(coalesce(p_last_name, c.last_name)) = '' then
      raise exception 'a candidate needs a name' using errcode = 'P0001';
    end if;
  end if;

  if p_first_name is not null and btrim(p_first_name) is distinct from c.first_name then
    v_changed := array_append(v_changed, 'name');
  elsif p_last_name is not null and btrim(p_last_name) is distinct from c.last_name then
    v_changed := array_append(v_changed, 'name');
  end if;
  if p_part is not null and nullif(btrim(p_part), '') is distinct from c.part then
    v_changed := array_append(v_changed, 'part');
  end if;
  if p_phone is not null and nullif(btrim(p_phone), '') is distinct from c.phone then
    v_changed := array_append(v_changed, 'phone');
  end if;
  if p_place is not null and nullif(btrim(p_place), '') is distinct from c.place then
    v_changed := array_append(v_changed, 'place');
  end if;

  update public.candidates
     set first_name = case when p_first_name is null then first_name else btrim(p_first_name) end,
         last_name  = case when p_last_name is null then last_name else btrim(p_last_name) end,
         part       = case when p_part is null then part else nullif(btrim(p_part), '') end,
         phone      = case when p_phone is null then phone else nullif(btrim(p_phone), '') end,
         place      = case when p_place is null then place else nullif(btrim(p_place), '') end
   where id = p_candidate
   returning * into c;

  -- The call row carries its own copy of the name, because that is what the
  -- board renders. Correcting a name while the candidate is on screen has to
  -- correct the copy too, or the hall keeps reading the mistake.
  if 'name' = any (v_changed) then
    select show_name_on_tv into v_show_name from public.centers where id = c.center_id;

    update public.public_display_calls
       set candidate_name = case
             when coalesce(v_show_name, true) then btrim(c.first_name || ' ' || c.last_name)
           end
     where center_id = c.center_id and active and candidate_id = c.id;
  end if;

  if array_length(v_changed, 1) > 0 then
    perform public.fets_log_event(
      c.id, c.center_id, 'details_edited', c.status, c.status,
      array_to_string(v_changed, ', ') || ' changed',
      jsonb_build_object('fields', to_jsonb(v_changed))
    );
  end if;

  return c;
end;
$fn$;

create or replace function public.fets_start_blank_session(
  p_center uuid,
  p_exam_name text,
  p_exam_date date
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

  update public.exam_sessions set status = 'closed'
   where center_id = p_center and status in ('draft', 'ready', 'live');

  -- The board picks the active call by centre, not by session, so a call left
  -- over from the list just closed would keep its candidate on the TV.
  update public.public_display_calls set active = false
   where center_id = p_center and active;

  update public.candidates set called_at = null
   where center_id = p_center and called_at is not null;

  insert into public.exam_sessions (center_id, exam_date, exam_name, source_filename, status, created_by)
  values (p_center, p_exam_date, v_name, null, 'live', auth.uid())
  returning * into s;

  return s;
end;
$fn$;

create or replace function public.fets_import_roster(
  p_center uuid,
  p_exam_name text,
  p_exam_date date,
  p_filename text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'no rows to import' using errcode = 'P0001';
  end if;

  select * into r from public.schedule_rules where center_id = p_center;
  if not found then raise exception 'set up the center schedule before importing' using errcode = 'P0002'; end if;

  update public.exam_sessions set status = 'closed'
   where center_id = p_center and status in ('draft', 'ready', 'live');

  -- The board picks the active call by centre, not by session, so a call left
  -- over from the list just closed would keep its candidate on the TV while the
  -- new list is loading.
  update public.public_display_calls set active = false
   where center_id = p_center and active;

  update public.candidates set called_at = null
   where center_id = p_center and called_at is not null;

  insert into public.exam_sessions (center_id, exam_date, exam_name, source_filename, status, created_by)
  values (p_center, p_exam_date, p_exam_name, p_filename, 'live', auth.uid())
  returning id into v_session;

  v_slot_capacity := greatest(
    1,
    ceil(r.labs_count::numeric * r.lab_capacity * r.slot_interval_minutes / r.exam_duration_minutes)::integer
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
      part, phone, place, roster_flag, public_token, status, scheduled_at
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
      v_slot
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
$$;