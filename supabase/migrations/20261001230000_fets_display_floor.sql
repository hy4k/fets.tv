-- The idle TV shows the room: the exams running now, and how many seats are
-- taken and free. Somebody here early for a later slot can see there is room
-- and ask the desk to go in sooner.

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
  v_floor jsonb;
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

  -- The room at rest: which exams are running now, and how many seats are
  -- taken and free, so somebody here early for a later slot can see there is
  -- room and ask to go in sooner. Faulty seats count as neither.
  select jsonb_build_object(
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'testing', x.n) order by x.n desc, x.name)
        from (
          select coalesce(p.name, nullif(btrim(c2.live_exam_name), ''), 'Exam') as name, count(*) as n
            from public.candidates c2
            left join public.exam_programmes p on p.id = c2.programme_id
           where c2.center_id = d.center_id
             and c2.exam_session_id = v_session
             and c2.exam_started_at is not null
             and c2.exam_finished_at is null
             and c2.status not in ('completed', 'signed_out', 'no_show')
           group by 1
        ) x
    ), '[]'::jsonb),
    'seats_total', (select count(*) from public.workstations w where w.center_id = d.center_id and w.lab_id is not null and w.status <> 'fault'),
    'seats_in_use', (select count(*) from public.workstations w where w.center_id = d.center_id and w.lab_id is not null and w.status in ('assigned', 'active')),
    'seats_free', (select count(*) from public.workstations w where w.center_id = d.center_id and w.lab_id is not null and w.status = 'free')
  ) into v_floor;

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
    'floor', v_floor,
    'server_time', now()
  );
end;
$fn$;

