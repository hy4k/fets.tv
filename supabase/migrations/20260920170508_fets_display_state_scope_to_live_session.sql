-- The board's "next up" was scoped to the centre, not to the running session,
-- so once a second roster was imported the hall saw a mix of today's
-- candidates and the previous sitting's. It now reads only the live session.

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
  v_session uuid;
  v_show_name boolean;
  v_tz text;
  v_next jsonb;
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
       where center_id = d.center_id
         and exam_session_id = v_session
         and status = 'waiting'
         and called_at is null
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
