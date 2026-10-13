-- Every piece of the TV home screen can be changed, hidden or added to.
--
-- The home screen had a layout choice and a welcome line; the seat count, the
-- exams list and the early-entry message under them were fixed words. Now each
-- piece has its own switch and its own wording, staff can add lines of their
-- own, and the centre chooses what the TV plays when a candidate is called.
--
-- An empty text means "use the standard wording", so a cleared box puts the
-- default back rather than leaving a hole on the screen.

alter table public.display_home
  add column if not exists show_welcome boolean not null default true,
  add column if not exists show_seats boolean not null default true,
  add column if not exists seats_free_label text not null default '',
  add column if not exists seats_used_label text not null default '',
  add column if not exists exams_label text not null default '',
  add column if not exists exams_empty text not null default '',
  add column if not exists early_text text not null default '',
  add column if not exists full_text text not null default '',
  -- Lines staff add themselves, shown under the welcome, in order.
  add column if not exists lines jsonb not null default '[]'::jsonb,
  -- What the hall hears when somebody is called: a chime and the name spoken,
  -- the chime alone, or nothing.
  add column if not exists call_sound text not null default 'voice';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'display_home_call_sound_check') then
    alter table public.display_home
      add constraint display_home_call_sound_check check (call_sound in ('voice', 'chime', 'off'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'display_home_lines_array') then
    alter table public.display_home
      add constraint display_home_lines_array check (jsonb_typeof(lines) = 'array');
  end if;
end $$;

-- What each centre shows today stays exactly as it is.
update public.display_home
   set show_welcome = layout <> 'room',
       show_seats = layout <> 'welcome',
       show_exams = show_exams and layout <> 'welcome',
       show_early = show_early and layout <> 'welcome'
 where updated_at < now();

-- A change made on one console reaches the TV and the other consoles at once.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'display_home'
  ) then
    alter publication supabase_realtime add table public.display_home;
  end if;
end $$;

create or replace function public.fets_save_display_home(p_center uuid, p_home jsonb)
returns public.display_home
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  h public.display_home;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_text text;
  v_welcome boolean := coalesce((p_home ->> 'show_welcome')::boolean, false);
  v_seats boolean := coalesce((p_home ->> 'show_seats')::boolean, true);
  v_exams boolean := coalesce((p_home ->> 'show_exams')::boolean, true);
  v_early boolean := coalesce((p_home ->> 'show_early')::boolean, true);
  v_sound text := coalesce(nullif(p_home ->> 'call_sound', ''), 'voice');
  -- Each text and the most a television can carry of it.
  v_limits constant jsonb := '{"title":80,"subtitle":160,"seats_free_label":30,"seats_used_label":40,
                               "exams_label":40,"exams_empty":80,"early_text":200,"full_text":200}';
  v_key text;
begin
  perform public.fets_guard(p_center, array['admin', 'tca', 'front_office']::public.user_role[]);

  if jsonb_typeof(p_home) is distinct from 'object' then
    raise exception 'nothing to save' using errcode = 'P0001';
  end if;
  if v_sound not in ('voice', 'chime', 'off') then
    raise exception 'unknown call sound %', v_sound using errcode = 'P0001';
  end if;
  for v_key in select jsonb_object_keys(v_limits) loop
    if length(btrim(coalesce(p_home ->> v_key, ''))) > (v_limits ->> v_key)::int then
      raise exception 'that is too long for a television' using errcode = 'P0001';
    end if;
  end loop;

  if p_home ? 'lines' then
    if jsonb_typeof(p_home -> 'lines') is distinct from 'array' then
      raise exception 'lines must be a list' using errcode = 'P0001';
    end if;
    for v_line in select value from jsonb_array_elements(p_home -> 'lines') loop
      v_text := btrim(coalesce(v_line #>> '{}', ''));
      continue when v_text = '';
      if length(v_text) > 160 then
        raise exception 'that is too long for a television' using errcode = 'P0001';
      end if;
      v_lines := v_lines || to_jsonb(v_text);
    end loop;
    if jsonb_array_length(v_lines) > 8 then
      raise exception 'eight lines at most fit on the screen' using errcode = 'P0001';
    end if;
  end if;

  insert into public.display_home as d (
    center_id, layout, title, subtitle, show_exams, show_early,
    show_welcome, show_seats, seats_free_label, seats_used_label, exams_label, exams_empty,
    early_text, full_text, lines, call_sound, updated_at, updated_by
  )
  values (
    p_center,
    -- Kept for any screen still reading the old layout.
    case when v_welcome and (v_seats or v_exams or v_early) then 'both' when v_welcome then 'welcome' else 'room' end,
    btrim(coalesce(p_home ->> 'title', '')), btrim(coalesce(p_home ->> 'subtitle', '')),
    v_exams, v_early, v_welcome, v_seats,
    btrim(coalesce(p_home ->> 'seats_free_label', '')), btrim(coalesce(p_home ->> 'seats_used_label', '')),
    btrim(coalesce(p_home ->> 'exams_label', '')), btrim(coalesce(p_home ->> 'exams_empty', '')),
    btrim(coalesce(p_home ->> 'early_text', '')), btrim(coalesce(p_home ->> 'full_text', '')),
    v_lines, v_sound, now(), auth.uid()
  )
  on conflict (center_id) do update
     set layout = excluded.layout, title = excluded.title, subtitle = excluded.subtitle,
         show_exams = excluded.show_exams, show_early = excluded.show_early,
         show_welcome = excluded.show_welcome, show_seats = excluded.show_seats,
         seats_free_label = excluded.seats_free_label, seats_used_label = excluded.seats_used_label,
         exams_label = excluded.exams_label, exams_empty = excluded.exams_empty,
         early_text = excluded.early_text, full_text = excluded.full_text,
         lines = excluded.lines, call_sound = excluded.call_sound,
         updated_at = now(), updated_by = auth.uid()
  returning * into h;
  return h;
end;
$fn$;

revoke all on function public.fets_save_display_home(uuid, jsonb) from public, anon;
grant execute on function public.fets_save_display_home(uuid, jsonb) to authenticated;

-- The TV reads every home screen setting with the rest of its state. Only the
-- home screen part changes from the previous version.
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
  v_home jsonb;
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

  -- Everything the centre set, minus who set it and when.
  select to_jsonb(h) - 'center_id' - 'updated_at' - 'updated_by'
    into v_home from public.display_home h where h.center_id = d.center_id;

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
    'home', v_home,
    'server_time', now()
  );
end;
$fn$;
