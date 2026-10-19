-- The TV Channel: designed slides that take turns on the hall TV between calls.
--
-- Until now the TV showed the home screen or one message put up by hand. Now a
-- centre keeps a playlist of slides — a mock exam promo with a QR code to book,
-- the next batch, the partners FETS tests for, an exam-day tip, a poster made
-- in Canva, and the home screen itself — each with its own schedule: dates,
-- days of the week and hours. The TV reads the playlist with the rest of its
-- state and decides from its own clock which slides are on, so a slide starts
-- and stops on the minute. A call always takes the screen first, and a message
-- put up by hand comes before the loop.
--
-- Run once in the fets.online Supabase project (ueufcqmdqtwvhjjyudeu). Until it
-- is run the TV and the console carry on exactly as before.

begin;

create table if not exists public.display_slides (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  kind text not null check (kind in ('promo', 'batch', 'partners', 'tip', 'poster', 'today')),
  -- The staff's own name for it; never shown on the TV.
  label text not null default '',
  -- The words the design shows, by the design's own field names.
  fields jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object'),
  -- Where the QR code takes a phone; null for no QR code.
  link text check (link is null or (link ~* '^https?://' and length(link) <= 300)),
  -- A file in the notice-media bucket, under the centre's own folder.
  media_path text,
  media_kind text check (media_kind is null or media_kind in ('image', 'video')),
  seconds integer not null default 12 check (seconds between 5 and 60),
  starts_on date,
  ends_on date,
  -- 0 Sunday … 6 Saturday.
  days smallint[] not null default '{0,1,2,3,4,5,6}',
  from_time time,
  to_time time,
  -- Shown at every centre, not only the one that made it.
  everywhere boolean not null default false,
  position integer not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (starts_on is null or ends_on is null or starts_on <= ends_on),
  check (days <@ '{0,1,2,3,4,5,6}'::smallint[] and cardinality(days) between 1 and 7)
);

create index if not exists display_slides_center_idx on public.display_slides (center_id, position);

alter table public.display_slides enable row level security;

drop policy if exists staff_read_display_slides on public.display_slides;
create policy staff_read_display_slides on public.display_slides
  for select to authenticated using (public.current_center_id() = center_id or everywhere);

-- A change on one console reaches the TVs and the other consoles at once.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'display_slides'
  ) then
    alter publication supabase_realtime add table public.display_slides;
  end if;
end $$;

-- Adds a slide (no id) or changes one (with its id). Every field is checked
-- here, whatever the console sent, because this is what a TV puts in front of
-- a full hall.
create or replace function public.fets_save_slide(p_center uuid, p_slide jsonb)
returns public.display_slides
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  s public.display_slides;
  v_id uuid := nullif(p_slide ->> 'id', '')::uuid;
  v_kind text := p_slide ->> 'kind';
  v_fields jsonb := '{}'::jsonb;
  v_key text;
  v_value text;
  v_link text := nullif(btrim(coalesce(p_slide ->> 'link', '')), '');
  v_media text := nullif(btrim(coalesce(p_slide ->> 'media_path', '')), '');
  v_media_kind text := nullif(p_slide ->> 'media_kind', '');
  v_seconds integer := coalesce((p_slide ->> 'seconds')::integer, 12);
  v_days smallint[];
begin
  perform public.fets_guard(p_center, array['admin', 'tca', 'front_office']::public.user_role[]);

  if jsonb_typeof(p_slide) is distinct from 'object' then
    raise exception 'nothing to save' using errcode = 'P0001';
  end if;
  if v_kind is null or v_kind not in ('promo', 'batch', 'partners', 'tip', 'poster', 'today') then
    raise exception 'unknown slide design %', coalesce(v_kind, '') using errcode = 'P0001';
  end if;

  if p_slide ? 'fields' then
    if jsonb_typeof(p_slide -> 'fields') is distinct from 'object' then
      raise exception 'the slide''s words must be a set of fields' using errcode = 'P0001';
    end if;
    for v_key, v_value in select key, btrim(coalesce(value #>> '{}', '')) from jsonb_each(p_slide -> 'fields') loop
      continue when v_value = '';
      if length(v_key) > 20 or length(v_value) > 200 then
        raise exception 'that is too long for a television' using errcode = 'P0001';
      end if;
      v_fields := v_fields || jsonb_build_object(v_key, v_value);
    end loop;
  end if;

  if v_link is not null and (v_link !~* '^https?://[^[:space:]]+$' or length(v_link) > 300) then
    raise exception 'the QR code needs a web link starting with https://' using errcode = 'P0001';
  end if;
  if v_media is not null and split_part(v_media, '/', 1) <> p_center::text then
    raise exception 'that file belongs to another centre' using errcode = 'P0001';
  end if;
  if v_media is not null and v_media_kind not in ('image', 'video') then
    raise exception 'a poster is an image or a video' using errcode = 'P0001';
  end if;
  if v_seconds not between 5 and 60 then
    raise exception 'a slide stays between 5 and 60 seconds' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct d::smallint order by d::smallint), '{}')
    into v_days
    from jsonb_array_elements_text(coalesce(p_slide -> 'days', '[0,1,2,3,4,5,6]'::jsonb)) d;
  if cardinality(v_days) = 0 then
    raise exception 'pick at least one day' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.display_slides (
      center_id, kind, label, fields, link, media_path, media_kind, seconds,
      starts_on, ends_on, days, from_time, to_time, everywhere, active, position,
      created_by, updated_by
    )
    values (
      p_center, v_kind, left(btrim(coalesce(p_slide ->> 'label', '')), 60), v_fields, v_link, v_media,
      case when v_media is null then null else v_media_kind end, v_seconds,
      nullif(p_slide ->> 'starts_on', '')::date, nullif(p_slide ->> 'ends_on', '')::date, v_days,
      nullif(p_slide ->> 'from_time', '')::time, nullif(p_slide ->> 'to_time', '')::time,
      coalesce((p_slide ->> 'everywhere')::boolean, false), coalesce((p_slide ->> 'active')::boolean, true),
      coalesce((select max(position) + 1 from public.display_slides where center_id = p_center), 1),
      auth.uid(), auth.uid()
    )
    returning * into s;
  else
    update public.display_slides
       set kind = v_kind,
           label = left(btrim(coalesce(p_slide ->> 'label', '')), 60),
           fields = v_fields,
           link = v_link,
           media_path = v_media,
           media_kind = case when v_media is null then null else v_media_kind end,
           seconds = v_seconds,
           starts_on = nullif(p_slide ->> 'starts_on', '')::date,
           ends_on = nullif(p_slide ->> 'ends_on', '')::date,
           days = v_days,
           from_time = nullif(p_slide ->> 'from_time', '')::time,
           to_time = nullif(p_slide ->> 'to_time', '')::time,
           everywhere = coalesce((p_slide ->> 'everywhere')::boolean, false),
           active = coalesce((p_slide ->> 'active')::boolean, true),
           updated_by = auth.uid(),
           updated_at = now()
     where id = v_id and center_id = p_center
    returning * into s;
    if not found then
      raise exception 'that slide belongs to another centre or was deleted' using errcode = 'P0001';
    end if;
  end if;
  return s;
end;
$fn$;

create or replace function public.fets_delete_slide(p_center uuid, p_slide uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  perform public.fets_guard(p_center, array['admin', 'tca', 'front_office']::public.user_role[]);
  delete from public.display_slides where id = p_slide and center_id = p_center;
end;
$fn$;

-- The playlist's order, as the console lists it.
create or replace function public.fets_order_slides(p_center uuid, p_slides uuid[])
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  perform public.fets_guard(p_center, array['admin', 'tca', 'front_office']::public.user_role[]);
  update public.display_slides s
     set position = o.n
    from unnest(p_slides) with ordinality as o(id, n)
   where s.id = o.id and s.center_id = p_center;
end;
$fn$;

revoke all on function public.fets_save_slide(uuid, jsonb) from public, anon;
revoke all on function public.fets_delete_slide(uuid, uuid) from public, anon;
revoke all on function public.fets_order_slides(uuid, uuid[]) from public, anon;
grant execute on function public.fets_save_slide(uuid, jsonb) to authenticated;
grant execute on function public.fets_delete_slide(uuid, uuid) to authenticated;
grant execute on function public.fets_order_slides(uuid, uuid[]) to authenticated;

commit;
