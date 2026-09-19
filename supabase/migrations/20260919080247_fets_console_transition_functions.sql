-- Per-action transitions for the FETS Console. Each one checks the operator's
-- center and role, enforces the stage rule for that step, and writes the audit
-- event in the same commit.

-- Calls belong to a center; which TV shows them is resolved through
-- public_displays, so the old per-key column is no longer required.
alter table public.public_display_calls alter column display_key drop not null;

create or replace function public.fets_guard(p_center uuid, p_roles public.user_role[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role;
  v_center uuid;
begin
  select role, center_id into v_role, v_center from public.profiles where id = auth.uid();

  if v_center is null then
    raise exception 'no operator profile for this user' using errcode = '42501';
  end if;

  if v_center <> p_center then
    raise exception 'operator belongs to a different center' using errcode = '42501';
  end if;

  if not (v_role = any (p_roles)) then
    raise exception 'role % may not perform this action', v_role using errcode = '42501';
  end if;
end;
$$;

create or replace function public.fets_log_event(
  p_candidate uuid,
  p_center uuid,
  p_type text,
  p_from public.candidate_stage,
  p_to public.candidate_stage,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.candidate_events
    (candidate_id, center_id, event_type, from_status, to_status, operator_id, note, metadata_json)
  values (p_candidate, p_center, p_type, p_from, coalesce(p_to, p_from), auth.uid(), p_note, p_metadata);
$$;

create or replace function public.fets_next_status(
  p_status public.candidate_stage,
  p_frisking boolean,
  p_biometrics boolean
)
returns public.candidate_stage
language sql
immutable
as $$
  select case p_status
    when 'scheduled' then 'arrived'
    when 'arrived' then 'id_checked'
    when 'id_checked' then 'waiting'
    when 'waiting' then case when p_frisking then 'frisking' when p_biometrics then 'biometrics' else 'assigned' end
    when 'frisking' then case when p_biometrics then 'biometrics' else 'assigned' end
    when 'biometrics' then 'assigned'
    when 'assigned' then 'lab_entry'
    when 'lab_entry' then 'testing'
    when 'testing' then 'completed'
    when 'completed' then 'signed_out'
  end::public.candidate_stage;
$$;

create or replace function public.fets_verify_id(p_candidate uuid)
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

  perform public.fets_guard(c.center_id, array['admin', 'front_office']::public.user_role[]);

  if c.status not in ('scheduled', 'arrived') then
    raise exception 'ID check is not valid from status %', c.status using errcode = 'P0001';
  end if;

  v_from := c.status;

  update public.candidates
     set arrival_at = coalesce(arrival_at, now()),
         id_verified_at = now(),
         status = 'id_checked'
   where id = p_candidate
  returning * into c;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.id_verified', v_from, c.status);
  return c;
end;
$$;

create or replace function public.fets_assign_locker(p_candidate uuid, p_key text)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  v_holder text;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'front_office']::public.user_role[]);

  if c.status in ('completed', 'signed_out', 'no_show') then
    raise exception 'candidate is no longer in the hall' using errcode = 'P0001';
  end if;

  select public_token into v_holder
    from public.candidates
   where exam_session_id = c.exam_session_id
     and locker_key = p_key
     and id <> p_candidate
     and status not in ('signed_out', 'no_show')
   limit 1;

  if v_holder is not null then
    raise exception 'locker % is already issued to %', p_key, v_holder using errcode = 'P0001';
  end if;

  update public.candidates set locker_key = p_key where id = p_candidate returning * into c;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.locker_issued', c.status, c.status, null,
    jsonb_build_object('locker_key', p_key));
  return c;
end;
$$;

create or replace function public.fets_check_in(p_candidate uuid)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  v_from public.candidate_stage;
  v_key_required boolean;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'front_office']::public.user_role[]);

  if c.status <> 'id_checked' then
    raise exception 'check-in requires a cross-verified ID (status is %)', c.status using errcode = 'P0001';
  end if;

  select locker_key_required into v_key_required from public.schedule_rules where center_id = c.center_id;

  if coalesce(v_key_required, true) and c.locker_key is null then
    raise exception 'a locker key must be issued before check-in' using errcode = 'P0001';
  end if;

  v_from := c.status;

  update public.candidates set check_in_at = now(), status = 'waiting' where id = p_candidate returning * into c;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.checked_in', v_from, c.status);
  return c;
end;
$$;

create or replace function public.fets_call_candidate(p_candidate uuid, p_room text default null)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  r public.schedule_rules;
  v_show_name boolean;
  v_room text;
  v_hall text;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin']::public.user_role[]);

  if c.status <> 'waiting' then
    raise exception 'only checked-in candidates can be called (status is %)', c.status using errcode = 'P0001';
  end if;

  select * into r from public.schedule_rules where center_id = c.center_id;
  select show_name_on_tv into v_show_name from public.centers where id = c.center_id;
  select coalesce(min(hall_label), 'HALL 1') into v_hall from public.public_displays where center_id = c.center_id and active;

  v_room := coalesce(
    p_room,
    case
      when coalesce(r.frisking_enabled, true) then 'Frisking · Gate 1'
      when coalesce(r.biometrics_enabled, true) then 'Biometrics · Desk 1'
      else 'Lab entry'
    end
  );

  update public.candidates set called_at = null
   where center_id = c.center_id and called_at is not null and id <> p_candidate;

  update public.candidates set called_at = now() where id = p_candidate returning * into c;

  update public.public_display_calls set active = false where center_id = c.center_id and active;

  insert into public.public_display_calls
    (center_id, candidate_id, token, candidate_name, room_label, instruction, hall, call_nonce, active, created_by)
  values (
    c.center_id,
    c.id,
    c.public_token,
    case when coalesce(v_show_name, true) then btrim(c.first_name || ' ' || c.last_name) end,
    v_room,
    'Proceed now',
    v_hall,
    0,
    true,
    auth.uid()
  );

  perform public.fets_log_event(c.id, c.center_id, 'display.call_updated', c.status, c.status, null,
    jsonb_build_object('room', v_room));
  return c;
end;
$$;

create or replace function public.fets_recall(p_center uuid)
returns public.public_display_calls
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.public_display_calls;
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  select * into d from public.public_display_calls
   where center_id = p_center and active and candidate_id is not null
   order by created_at desc limit 1;

  if not found then
    raise exception 'nothing is on the display to re-call' using errcode = 'P0001';
  end if;

  update public.public_display_calls set active = false where center_id = p_center and active;

  insert into public.public_display_calls
    (center_id, candidate_id, token, candidate_name, room_label, instruction, hall, call_nonce, active, created_by)
  values (d.center_id, d.candidate_id, d.token, d.candidate_name, d.room_label, d.instruction, d.hall,
          d.call_nonce + 1, true, auth.uid())
  returning * into d;

  perform public.fets_log_event(d.candidate_id, p_center, 'display.recalled', null, null, null,
    jsonb_build_object('nonce', d.call_nonce));
  return d;
end;
$$;

create or replace function public.fets_clear_call(p_center uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate uuid;
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  select candidate_id into v_candidate from public.public_display_calls
   where center_id = p_center and active order by created_at desc limit 1;

  update public.candidates set called_at = null where center_id = p_center and called_at is not null;
  update public.public_display_calls set active = false where center_id = p_center and active;

  if v_candidate is not null then
    perform public.fets_log_event(v_candidate, p_center, 'display.call_cleared', null, null);
  end if;
end;
$$;

create or replace function public.fets_mark_entered(p_center uuid)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  r public.schedule_rules;
  v_from public.candidate_stage;
  v_next public.candidate_stage;
  v_candidate uuid;
begin
  perform public.fets_guard(p_center, array['admin', 'front_office']::public.user_role[]);

  select candidate_id into v_candidate from public.public_display_calls
   where center_id = p_center and active and candidate_id is not null
   order by created_at desc limit 1;

  if v_candidate is null then
    raise exception 'no candidate is currently called' using errcode = 'P0001';
  end if;

  select * into c from public.candidates where id = v_candidate for update;
  select * into r from public.schedule_rules where center_id = p_center;

  v_from := c.status;
  v_next := public.fets_next_status(c.status, coalesce(r.frisking_enabled, true), coalesce(r.biometrics_enabled, true));

  update public.candidates
     set status = v_next,
         called_at = null,
         frisked_at = case when v_next = 'frisking' then coalesce(frisked_at, now()) else frisked_at end
   where id = c.id
  returning * into c;

  update public.public_display_calls set active = false where center_id = p_center and active;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.entered', v_from, c.status);
  return c;
end;
$$;

create or replace function public.fets_advance_stage(p_candidate uuid, p_note text default null)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  r public.schedule_rules;
  v_from public.candidate_stage;
  v_next public.candidate_stage;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'lab_staff']::public.user_role[]);

  select * into r from public.schedule_rules where center_id = c.center_id;
  v_from := c.status;
  v_next := public.fets_next_status(c.status, coalesce(r.frisking_enabled, true), coalesce(r.biometrics_enabled, true));

  if v_next is null then
    raise exception 'candidate is already at the end of the workflow (%)', c.status using errcode = 'P0001';
  end if;

  if v_next = 'lab_entry' and c.workstation_id is null then
    raise exception 'assign a workstation before lab entry' using errcode = 'P0001';
  end if;

  update public.candidates
     set status = v_next,
         frisked_at = case when v_next = 'biometrics' then coalesce(frisked_at, now()) else frisked_at end,
         biometrics_at = case when v_next = 'assigned' then coalesce(biometrics_at, now()) else biometrics_at end,
         lab_entry_at = case when v_next = 'lab_entry' then now() else lab_entry_at end,
         testing_started_at = case when v_next = 'testing' then now() else testing_started_at end,
         completed_at = case when v_next = 'completed' then now() else completed_at end,
         signed_out_at = case when v_next = 'signed_out' then now() else signed_out_at end,
         workstation_id = case when v_next = 'completed' then null else workstation_id end
   where id = p_candidate
  returning * into c;

  if v_next = 'testing' then
    update public.workstations set status = 'active' where current_candidate_id = c.id;
  elsif v_next = 'completed' then
    update public.workstations set status = 'free', current_candidate_id = null where current_candidate_id = c.id;
  end if;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.status_changed', v_from, c.status, p_note);
  return c;
end;
$$;

create or replace function public.fets_assign_workstation(p_candidate uuid, p_workstation uuid)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  w public.workstations;
  v_from public.candidate_stage;
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

  update public.workstations set status = 'assigned', current_candidate_id = c.id where id = p_workstation;

  v_from := c.status;

  update public.candidates
     set workstation_id = p_workstation,
         status = case when c.status in ('frisking', 'biometrics', 'waiting') then 'assigned' else c.status end
   where id = p_candidate
  returning * into c;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.assigned', v_from, c.status, null,
    jsonb_build_object('seat_code', w.seat_code, 'lab', w.lab_name));
  return c;
end;
$$;

create or replace function public.fets_set_workstation_status(p_workstation uuid, p_status text)
returns public.workstations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w public.workstations;
begin
  select * into w from public.workstations where id = p_workstation for update;
  if not found then raise exception 'workstation not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(w.center_id, array['admin', 'lab_staff']::public.user_role[]);

  if p_status not in ('free', 'active', 'assigned', 'cleaning', 'fault') then
    raise exception 'unknown workstation status %', p_status using errcode = 'P0001';
  end if;

  if p_status in ('free', 'fault', 'cleaning') and w.current_candidate_id is not null then
    raise exception 'workstation % still holds a candidate', w.seat_code using errcode = 'P0001';
  end if;

  update public.workstations set status = p_status where id = p_workstation returning * into w;
  return w;
end;
$$;

create or replace function public.fets_mark_no_show(p_candidate uuid, p_note text default null)
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

  perform public.fets_guard(c.center_id, array['admin', 'front_office']::public.user_role[]);

  v_from := c.status;

  update public.candidates set status = 'no_show', called_at = null where id = p_candidate returning * into c;

  update public.workstations set status = 'free', current_candidate_id = null where current_candidate_id = c.id;
  update public.public_display_calls set active = false where candidate_id = c.id and active;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.no_show', v_from, c.status, p_note);
  return c;
end;
$$;

create or replace function public.fets_admin_override(p_candidate uuid, p_status public.candidate_stage, p_note text)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  v_from public.candidate_stage;
begin
  if p_note is null or btrim(p_note) = '' then
    raise exception 'an override needs a reason' using errcode = 'P0001';
  end if;

  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin']::public.user_role[]);

  v_from := c.status;

  update public.candidates set status = p_status, called_at = null where id = p_candidate returning * into c;

  perform public.fets_log_event(c.id, c.center_id, 'admin.override', v_from, c.status, p_note);
  return c;
end;
$$;

create or replace function public.fets_sync_workstations(p_center uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.schedule_rules;
  v_lab text;
  v_seat text;
  v_created integer := 0;
  i integer;
  j integer;
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  select * into r from public.schedule_rules where center_id = p_center;
  if not found then raise exception 'no schedule rules for this center' using errcode = 'P0002'; end if;

  for i in 1..r.labs_count loop
    v_lab := chr(64 + i);
    for j in 1..r.lab_capacity loop
      v_seat := v_lab || '-' || lpad(j::text, 2, '0');
      insert into public.workstations (center_id, lab_name, seat_code)
      values (p_center, v_lab, v_seat)
      on conflict (center_id, seat_code) do nothing;
      if found then v_created := v_created + 1; end if;
    end loop;
  end loop;

  return v_created;
end;
$$;

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

-- Read model for a public TV. Served by the Next.js server with the service
-- role; the display client never reaches Postgres.
create or replace function public.fets_display_state(p_display_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.public_displays;
  c public.public_display_calls;
  v_show_name boolean;
  v_tz text;
  v_next jsonb;
begin
  select * into d from public.public_displays
   where display_key_hash = encode(sha256(convert_to(p_display_key, 'utf8')), 'hex') and active;

  if not found then return null; end if;

  update public.public_displays set last_seen_at = now() where id = d.id;

  select * into c from public.public_display_calls
   where center_id = d.center_id and active and candidate_id is not null
   order by created_at desc limit 1;

  select show_name_on_tv, timezone into v_show_name, v_tz from public.centers where id = d.center_id;

  select coalesce(jsonb_agg(t order by t.scheduled_at nulls last, t.public_token), '[]'::jsonb)
    into v_next
    from (
      select public_token,
             case when coalesce(v_show_name, true) then btrim(first_name || ' ' || last_name) end as name,
             scheduled_at
        from public.candidates
       where center_id = d.center_id and status = 'waiting' and called_at is null
       order by scheduled_at nulls last, public_token
       limit 4
    ) t;

  return jsonb_build_object(
    'hall_label', d.hall_label,
    'label', d.label,
    'timezone', v_tz,
    'call', case when c.candidate_id is null then null else jsonb_build_object(
      'token', c.token,
      'name', case when coalesce(v_show_name, true) then c.candidate_name end,
      'room', c.room_label,
      'instruction', c.instruction,
      'nonce', c.call_nonce,
      'updated_at', c.created_at
    ) end,
    'next', v_next,
    'server_time', now()
  );
end;
$$;

-- The deployed generic transition kept working on any center. Close that while
-- leaving its signature intact for the existing UI.
create or replace function public.transition_candidate(
  p_candidate_id uuid,
  p_to_status public.candidate_stage,
  p_note text default null,
  p_locker_key text default null,
  p_workstation_id uuid default null
)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate public.candidates;
  v_from public.candidate_stage;
  v_now timestamptz := now();
begin
  select * into v_candidate from public.candidates where id = p_candidate_id for update;
  if not found then raise exception 'Candidate not found'; end if;

  perform public.fets_guard(v_candidate.center_id,
    array['admin', 'front_office', 'lab_staff']::public.user_role[]);

  v_from := v_candidate.status;

  update public.candidates set
    status = p_to_status,
    arrival_at = case when p_to_status = 'arrived' and arrival_at is null then v_now else arrival_at end,
    check_in_at = case when p_to_status = 'id_checked' and check_in_at is null then v_now else check_in_at end,
    id_verified_at = case when p_to_status in ('id_checked','waiting','frisking','biometrics','assigned','lab_entry','testing','completed','signed_out') and id_verified_at is null then v_now else id_verified_at end,
    locker_key = coalesce(p_locker_key, locker_key),
    frisked_at = case when p_to_status = 'frisking' and frisked_at is null then v_now else frisked_at end,
    biometrics_at = case when p_to_status = 'biometrics' and biometrics_at is null then v_now else biometrics_at end,
    workstation_id = coalesce(p_workstation_id, workstation_id),
    lab_entry_at = case when p_to_status = 'lab_entry' and lab_entry_at is null then v_now else lab_entry_at end,
    testing_started_at = case when p_to_status = 'testing' and testing_started_at is null then v_now else testing_started_at end,
    completed_at = case when p_to_status = 'completed' and completed_at is null then v_now else completed_at end,
    signed_out_at = case when p_to_status = 'signed_out' and signed_out_at is null then v_now else signed_out_at end
  where id = p_candidate_id
  returning * into v_candidate;

  perform public.fets_log_event(v_candidate.id, v_candidate.center_id, 'candidate.status_changed',
    v_from, p_to_status, p_note,
    jsonb_build_object('locker_key', p_locker_key, 'workstation_id', p_workstation_id));

  return v_candidate;
end;
$$;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'fets\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
  end loop;
end
$$;

grant execute on function
  public.fets_next_status(public.candidate_stage, boolean, boolean),
  public.fets_verify_id(uuid),
  public.fets_assign_locker(uuid, text),
  public.fets_check_in(uuid),
  public.fets_call_candidate(uuid, text),
  public.fets_recall(uuid),
  public.fets_clear_call(uuid),
  public.fets_mark_entered(uuid),
  public.fets_advance_stage(uuid, text),
  public.fets_assign_workstation(uuid, uuid),
  public.fets_set_workstation_status(uuid, text),
  public.fets_mark_no_show(uuid, text),
  public.fets_admin_override(uuid, public.candidate_stage, text),
  public.fets_sync_workstations(uuid),
  public.fets_import_roster(uuid, text, date, text, jsonb)
  to authenticated;

grant execute on function public.fets_display_state(text) to service_role;
