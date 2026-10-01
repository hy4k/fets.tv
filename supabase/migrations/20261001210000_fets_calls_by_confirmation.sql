-- Calls carry the confirmation number, and may follow one another at once.
--
-- The FETS token is retired from what candidates see: the provider already
-- gave them a confirmation number, and a second number on the TV only
-- confused people. The TV shows the name large and that number small.
--
-- The 45-second gap between calls is dropped: the admin room may call up to
-- five back to back while the front office catches up. The cap stays.
--
-- The gate is renamed: "Security & Biometrics".

create or replace function public.fets_call_candidate(p_candidate uuid, p_room text default null)
returns public.candidates
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  c public.candidates;
  r public.schedule_rules;
  v_show_name boolean;
  v_room text;
  v_hall text;
  v_pending integer;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'tca']::public.user_role[]);

  -- One caller at a time per centre, so the cap holds under a race.
  perform pg_advisory_xact_lock(hashtext('fets_call:' || c.center_id::text));

  if c.status <> 'waiting' then
    raise exception 'only checked-in candidates can be called (status is %)', c.status using errcode = 'P0001';
  end if;

  if c.called_at is not null then
    raise exception '% is already called — use Call again', btrim(c.first_name || ' ' || c.last_name) using errcode = 'P0001';
  end if;

  select * into r from public.schedule_rules where center_id = c.center_id;

  if coalesce(r.locker_key_required, true) and c.locker_key is null then
    raise exception '% needs a locker key, or Nil, before being called', btrim(c.first_name || ' ' || c.last_name)
      using errcode = 'P0001';
  end if;

  select count(*) into v_pending from public.candidates
   where center_id = c.center_id and status = 'waiting' and called_at is not null;
  if v_pending >= 5 then
    raise exception 'five candidates are already on their way — the front office sends one in first' using errcode = 'P0001';
  end if;

  select show_name_on_tv into v_show_name from public.centers where id = c.center_id;
  select coalesce(min(hall_label), 'HALL 1') into v_hall from public.public_displays where center_id = c.center_id and active;

  v_room := coalesce(
    p_room,
    case
      when coalesce(r.frisking_enabled, true) then 'Security & Biometrics'
      when coalesce(r.biometrics_enabled, true) then 'Biometrics · Desk 1'
      else 'Lab entry'
    end
  );

  update public.candidates set called_at = now() where id = p_candidate returning * into c;

  insert into public.public_display_calls
    (center_id, candidate_id, token, candidate_name, room_label, instruction, hall, call_nonce, active, created_by)
  values (
    c.center_id, c.id, coalesce(nullif(btrim(c.roster_number), ''), c.public_token),
    case when coalesce(v_show_name, true) then btrim(c.first_name || ' ' || c.last_name) end,
    v_room, 'Proceed now', v_hall, 0, true, auth.uid()
  );

  perform public.fets_log_event(c.id, c.center_id, 'display.call_updated', c.status, c.status, null,
    jsonb_build_object('room', v_room));
  return c;
end;
$fn$;

-- The TV: the newest call large, the others still on their way small.
create or replace function public.fets_display_state(p_display_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  d public.public_displays;
  c public.public_display_calls;
  nt public.display_notices;
  v_session uuid;
  v_show_name boolean;
  v_tz text;
  v_next jsonb;
  v_earlier jsonb;
begin
  select * into d from public.public_displays
   where display_key_hash = encode(sha256(convert_to(p_display_key, 'utf8')), 'hex') and active;

  if not found then return null; end if;

  update public.public_displays set last_seen_at = now() where id = d.id;

  select id into v_session from public.exam_sessions
   where center_id = d.center_id and status in ('ready', 'live')
   order by created_at desc limit 1;

  select * into c from public.public_display_calls
   where center_id = d.center_id and active and candidate_id is not null
   order by created_at desc limit 1;

  select show_name_on_tv, timezone into v_show_name, v_tz from public.centers where id = d.center_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'token', e.token,
           'name', case when coalesce(v_show_name, true) then e.candidate_name end,
           'room', e.room_label,
           'updated_at', e.created_at) order by e.created_at desc), '[]'::jsonb)
    into v_earlier
    from (
      select * from public.public_display_calls
       where center_id = d.center_id and active and candidate_id is not null
         and id is distinct from c.id
       order by created_at desc
       limit 4
    ) e;

  select * into nt from public.display_notices
   where center_id = d.center_id and active and (expires_at is null or expires_at > now())
   order by created_at desc limit 1;

  select coalesce(jsonb_agg(t order by t.scheduled_at nulls last, t.public_token), '[]'::jsonb)
    into v_next
    from (
      select coalesce(nullif(btrim(roster_number), ''), public_token) as public_token,
             case when coalesce(v_show_name, true) then btrim(first_name || ' ' || last_name) end as name,
             scheduled_at
        from public.candidates
       where center_id = d.center_id
         and exam_session_id = v_session
         and status = 'waiting'
         and called_at is null
       order by scheduled_at nulls last, public_token
       limit 4
    ) t;

  return jsonb_build_object(
    'hall_label', d.hall_label,
    'label', d.label, 'centre', (select ctr.name from public.centers ctr where ctr.id = d.center_id),
    'timezone', v_tz,
    'call', case when c.candidate_id is null then null else jsonb_build_object(
      'token', c.token,
      'name', case when coalesce(v_show_name, true) then c.candidate_name end,
      'room', c.room_label,
      'instruction', c.instruction,
      'nonce', c.call_nonce,
      'updated_at', c.created_at
    ) end,
    'earlier', v_earlier,
    'notice', case when nt.id is null then null else jsonb_build_object(
      'body', nt.body,
      'tone', nt.tone,
      'media_path', nt.media_path,
      'media_kind', nt.media_kind,
      'posted_at', nt.created_at,
      'style', nt.style
    ) end,
    'next', v_next,
    'server_time', now()
  );
end;
$fn$;

