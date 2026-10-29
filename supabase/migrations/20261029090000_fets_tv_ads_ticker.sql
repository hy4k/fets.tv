-- TV Channel, part three: video ads and the ticker.
--
-- Two new kinds in the TV Channel's list. A video ad plays start to finish
-- across the whole hall TV, however long it runs, and a call cuts in at once.
-- A ticker line scrolls along the bottom of the TV with the centre's other
-- lines whenever nobody is being called. Both keep the schedule, the on/off
-- switch and "both centres" that every slide has.
--
-- Ads may be longer than a poster's clip, so the TV's file bucket now takes
-- files up to 50 MB (the console still keeps posters and notices to 25 MB).
--
-- Run once in the fets.online Supabase project (ueufcqmdqtwvhjjyudeu), after
-- the TV Channel SQL. Until it is run the console cannot save an ad or a
-- ticker line; everything else carries on as before.

begin;

alter table public.display_slides drop constraint if exists display_slides_kind_check;
alter table public.display_slides add constraint display_slides_kind_check
  check (kind in ('promo', 'batch', 'partners', 'tip', 'poster', 'ad', 'ticker', 'today'));

update storage.buckets set file_size_limit = 52428800 where id = 'notice-media';

-- As before, with the two new kinds: an ad must carry a video, and a ticker
-- line is words only, no file and no QR code.
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
  if v_kind is null or v_kind not in ('promo', 'batch', 'partners', 'tip', 'poster', 'ad', 'ticker', 'today') then
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

  if v_kind = 'ticker' then
    if coalesce(v_fields ->> 'text', '') = '' then
      raise exception 'write the line for the ticker' using errcode = 'P0001';
    end if;
    if length(v_fields ->> 'text') > 140 then
      raise exception 'a ticker line is at most 140 characters' using errcode = 'P0001';
    end if;
    v_link := null;
    v_media := null;
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
  if v_kind = 'ad' and (v_media is null or v_media_kind is distinct from 'video') then
    raise exception 'a video ad needs its video' using errcode = 'P0001';
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

revoke all on function public.fets_save_slide(uuid, jsonb) from public, anon;
grant execute on function public.fets_save_slide(uuid, jsonb) to authenticated;

commit;
