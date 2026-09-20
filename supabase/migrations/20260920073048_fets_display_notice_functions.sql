-- Posting a notice. The body is built here from the template, never accepted
-- from the caller, so the board can only ever show the centre's own wording.

create or replace function public.fets_post_notice(
  p_center uuid,
  p_template uuid,
  p_values jsonb default '{}'::jsonb,
  p_expires_minutes integer default null
)
returns public.display_notices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.notice_templates;
  n public.display_notices;
  v_slot jsonb;
  v_key text;
  v_value text;
  v_body text;
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

    -- No control characters, and nothing long enough to overflow the board.
    if v_value ~ '[[:cntrl:]]' or length(v_value) > 40 then
      raise exception '% is not a valid value', coalesce(v_slot ->> 'label', v_key) using errcode = 'P0001';
    end if;

    v_body := replace(v_body, '{' || v_key || '}', v_value);
  end loop;

  if v_body ~ '\{[a-z_]+\}' then
    raise exception 'this template has a blank that was not filled in' using errcode = 'P0001';
  end if;

  update public.display_notices
     set active = false, cleared_at = now(), cleared_by = auth.uid()
   where center_id = p_center and active;

  insert into public.display_notices
    (center_id, template_id, template_key, template_label, values, body, tone, expires_at, created_by)
  values (
    p_center, t.id, t.key, t.label, coalesce(p_values, '{}'::jsonb), v_body, t.tone,
    case when p_expires_minutes is null then null else now() + make_interval(mins => p_expires_minutes) end,
    auth.uid()
  )
  returning * into n;

  return n;
end;
$$;

create or replace function public.fets_clear_notice(p_center uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fets_guard(p_center, array['admin', 'tca']::public.user_role[]);

  update public.display_notices
     set active = false, cleared_at = now(), cleared_by = auth.uid()
   where center_id = p_center and active;
end;
$$;

revoke all on function
  public.fets_post_notice(uuid, uuid, jsonb, integer),
  public.fets_clear_notice(uuid)
  from public, anon, authenticated;

grant execute on function
  public.fets_post_notice(uuid, uuid, jsonb, integer),
  public.fets_clear_notice(uuid)
  to authenticated;

-- The projection gains the notice. An expired notice simply stops being sent,
-- so a board left running overnight cannot keep yesterday's message up.
create or replace function public.fets_display_state(p_display_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.public_displays;
  c public.public_display_calls;
  nt public.display_notices;
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

  select * into nt from public.display_notices
   where center_id = d.center_id and active and (expires_at is null or expires_at > now())
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
    'notice', case when nt.id is null then null else jsonb_build_object(
      'body', nt.body,
      'tone', nt.tone,
      'posted_at', nt.created_at
    ) end,
    'next', v_next,
    'server_time', now()
  );
end;
$$;
