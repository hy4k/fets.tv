-- A roster is never complete on arrival. Somebody walks in who is not on the
-- list, or the board's export leaves a phone number or a place blank. These two
-- functions let an operator add a candidate by hand and correct the details of
-- one already imported, without touching the stage machinery: neither of them
-- moves a candidate through the day, they only change who the candidate is.

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
as $$
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
$$;

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
as $$
declare
  c public.candidates;
  v_changed text[] := '{}';
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

  if array_length(v_changed, 1) > 0 then
    perform public.fets_log_event(
      c.id, c.center_id, 'details_edited', c.status, c.status,
      array_to_string(v_changed, ', ') || ' changed',
      jsonb_build_object('fields', to_jsonb(v_changed))
    );
  end if;

  return c;
end;
$$;

revoke all on function
  public.fets_add_candidate(uuid, text, text, text, text, text, text),
  public.fets_update_candidate_details(uuid, text, text, text, text, text)
  from public, anon, authenticated;

grant execute on function
  public.fets_add_candidate(uuid, text, text, text, text, text, text),
  public.fets_update_candidate_details(uuid, text, text, text, text, text)
  to authenticated;

-- Some days there is no file to upload at all — a handful of walk-ins, or an
-- export that never arrived. This opens an empty list for the day so those
-- candidates have somewhere to go, and closes whatever was open before, exactly
-- as an import does.
create or replace function public.fets_start_blank_session(
  p_center uuid,
  p_exam_name text,
  p_exam_date date
)
returns public.exam_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  insert into public.exam_sessions (center_id, exam_date, exam_name, source_filename, status, created_by)
  values (p_center, p_exam_date, v_name, null, 'live', auth.uid())
  returning * into s;

  return s;
end;
$$;

revoke all on function public.fets_start_blank_session(uuid, text, date)
  from public, anon, authenticated;

grant execute on function public.fets_start_blank_session(uuid, text, date)
  to authenticated;
