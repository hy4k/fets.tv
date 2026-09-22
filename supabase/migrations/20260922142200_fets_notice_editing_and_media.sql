-- Messages the hall can be shown, in the centre's own words or in its own
-- pictures. Until now a message was a template rendered verbatim: staff could
-- fill a blank but not fix the wording, and a notice could carry no picture at
-- all.

-- The wording actually shown, when staff changed it, and the file that goes
-- with it. media_path is a key inside the notice-media bucket, never a URL: the
-- bucket is private and the display route signs a short-lived link, so a leaked
-- address does not become a permanent public one.
alter table public.display_notices
  add column if not exists body_override text,
  add column if not exists media_path text,
  add column if not exists media_kind text
    check (media_kind is null or media_kind in ('image', 'video', 'file'));

create or replace function public.fets_post_notice(
  p_center uuid,
  p_template uuid,
  p_values jsonb default '{}'::jsonb,
  p_expires_minutes integer default null,
  p_body_override text default null
)
returns public.display_notices
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  t public.notice_templates;
  n public.display_notices;
  v_slot jsonb;
  v_key text;
  v_value text;
  v_body text;
  v_override text := nullif(btrim(coalesce(p_body_override, '')), '');
begin
  perform public.fets_guard(p_center, array['admin', 'tca']::public.user_role[]);

  select * into t from public.notice_templates
   where id = p_template and active and (center_id is null or center_id = p_center);
  if not found then
    raise exception 'unknown notice template' using errcode = 'P0002';
  end if;

  if p_expires_minutes is not null and (p_expires_minutes < 1 or p_expires_minutes > 720) then
    raise exception 'an expiry must be between 1 and 720 minutes' using errcode = 'P0001';
  end if;

  v_body := t.body_template;

  for v_slot in select * from jsonb_array_elements(coalesce(t.slots, '[]'::jsonb)) loop
    v_key := v_slot ->> 'key';
    v_value := btrim(coalesce(p_values ->> v_key, ''));

    if v_value = '' then
      raise exception 'fill in %', coalesce(v_slot ->> 'label', v_key) using errcode = 'P0001';
    end if;

    if (v_slot ->> 'type') = 'time' and v_value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception '% must be a 24-hour time like 14:30', coalesce(v_slot ->> 'label', v_key)
        using errcode = 'P0001';
    end if;

    v_body := replace(v_body, '{' || v_key || '}', v_value);
  end loop;

  -- Staff may reword before it goes up. The template is still recorded, so the
  -- audit shows which message this began as and that somebody changed it.
  if v_override is not null then
    if length(v_override) > 280 then
      raise exception 'a message must be 280 characters or fewer' using errcode = 'P0001';
    end if;
    v_body := v_override;
  end if;

  update public.display_notices set active = false, cleared_at = now(), cleared_by = auth.uid()
   where center_id = p_center and active;

  insert into public.display_notices
    (center_id, template_id, template_key, template_label, values, body, body_override, tone, active,
     expires_at, created_by)
  values (
    p_center, t.id, t.key, t.label, coalesce(p_values, '{}'::jsonb), v_body, v_override, t.tone, true,
    case when p_expires_minutes is null then null else now() + make_interval(mins => p_expires_minutes) end,
    auth.uid()
  )
  returning * into n;

  return n;
end;
$fn$;

/**
 * A message in the centre's own words, with an optional picture, clip or file.
 *
 * The templates exist so routine wording stays the same every time; this is for
 * the day that does not fit one. It is still bounded -- 280 characters, one of
 * three tones -- so the board cannot be turned into a noticeboard.
 */
create or replace function public.fets_post_custom_notice(
  p_center uuid,
  p_body text,
  p_tone text default 'info',
  p_media_path text default null,
  p_media_kind text default null,
  p_expires_minutes integer default null
)
returns public.display_notices
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  n public.display_notices;
  v_body text := btrim(coalesce(p_body, ''));
  v_path text := nullif(btrim(coalesce(p_media_path, '')), '');
begin
  perform public.fets_guard(p_center, array['admin', 'tca']::public.user_role[]);

  if v_body = '' and v_path is null then
    raise exception 'a message needs words, a file, or both' using errcode = 'P0001';
  end if;

  if length(v_body) > 280 then
    raise exception 'a message must be 280 characters or fewer' using errcode = 'P0001';
  end if;

  if p_tone not in ('info', 'warning', 'urgent') then
    raise exception 'unknown tone %', p_tone using errcode = 'P0001';
  end if;

  if p_expires_minutes is not null and (p_expires_minutes < 1 or p_expires_minutes > 720) then
    raise exception 'an expiry must be between 1 and 720 minutes' using errcode = 'P0001';
  end if;

  if v_path is not null then
    if p_media_kind is null or p_media_kind not in ('image', 'video', 'file') then
      raise exception 'say whether the file is an image, a video or a file' using errcode = 'P0001';
    end if;

    -- The path is written by the client, so it is checked rather than trusted:
    -- it must sit under this centre's own folder in the bucket.
    if v_path !~ ('^' || p_center::text || '/[A-Za-z0-9._-]{1,120}$') then
      raise exception 'that file does not belong to this center' using errcode = 'P0001';
    end if;
  end if;

  update public.display_notices set active = false, cleared_at = now(), cleared_by = auth.uid()
   where center_id = p_center and active;

  insert into public.display_notices
    (center_id, template_id, template_key, template_label, values, body, body_override, tone,
     media_path, media_kind, active, expires_at, created_by)
  values (
    p_center, null, 'custom', 'Custom message', '{}'::jsonb, v_body, v_body, p_tone,
    v_path,
    case when v_path is null then null else p_media_kind end,
    true,
    case when p_expires_minutes is null then null else now() + make_interval(mins => p_expires_minutes) end,
    auth.uid()
  )
  returning * into n;

  return n;
end;
$fn$;

revoke all on function
  public.fets_post_notice(uuid, uuid, jsonb, integer, text),
  public.fets_post_custom_notice(uuid, text, text, text, text, integer)
  from public, anon, authenticated;

grant execute on function
  public.fets_post_notice(uuid, uuid, jsonb, integer, text),
  public.fets_post_custom_notice(uuid, text, text, text, text, integer)
  to authenticated;

-- The four-argument form is replaced by the five-argument one above; leaving it
-- in place would let a caller reach the version that cannot be reworded.
drop function if exists public.fets_post_notice(uuid, uuid, jsonb, integer);