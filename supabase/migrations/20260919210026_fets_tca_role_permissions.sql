-- A TCA runs the floor end to end: the front desk, the call to the TV, and the
-- lab. Configuration stays with admins — Setup, roster import, seat sync, and
-- moving a candidate backwards through the stages with an override.
--
-- Rather than widen fifteen role arrays, the guard treats a TCA as satisfying
-- anything front office or lab staff would satisfy. The three call actions are
-- guarded as 'admin' and so have to name the TCA explicitly.

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

  if v_role = any (p_roles) then
    return;
  end if;

  -- A TCA covers both desks, so any action either of them may do is theirs too.
  if v_role = 'tca' and (p_roles && array['front_office', 'lab_staff']::public.user_role[]) then
    return;
  end if;

  raise exception 'role % may not perform this action', v_role using errcode = '42501';
end;
$$;

create or replace function public.fets_call_candidate(p_candidate uuid, p_room text default null::text)
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

  perform public.fets_guard(c.center_id, array['admin', 'tca']::public.user_role[]);

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

create or replace function public.fets_clear_call(p_center uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate uuid;
begin
  perform public.fets_guard(p_center, array['admin', 'tca']::public.user_role[]);

  select candidate_id into v_candidate from public.public_display_calls
   where center_id = p_center and active order by created_at desc limit 1;

  update public.candidates set called_at = null where center_id = p_center and called_at is not null;
  update public.public_display_calls set active = false where center_id = p_center and active;

  if v_candidate is not null then
    perform public.fets_log_event(v_candidate, p_center, 'display.call_cleared', null, null);
  end if;
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
  perform public.fets_guard(p_center, array['admin', 'tca']::public.user_role[]);

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
