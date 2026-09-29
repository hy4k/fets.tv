-- Check-in is one press, the locker key is its own step, and a name that
-- does not match the ID is written down once — where it is seen.
--
-- 1. fets_check_in_one: the desk confirms the ID and checks the candidate in
--    together. If the name on the ID differs from the roster, the note typed
--    there becomes a reportable incident on the candidate, already closed
--    ("noted, admitted"), so it appears in the Center Problem Report without
--    anybody copying it across.
-- 2. Each centre has its own locker bank: CL-01..CL-40 at Calicut,
--    CK-01..CK-35 at Cochin, and "NIL" everywhere for somebody with nothing
--    to lock away. Keys outside the bank are refused.
-- 3. The key is issued after check-in now, so the rule "a key before going
--    in" moves to the call: nobody is called forward without a key or a Nil.

alter table public.centers add column if not exists locker_prefix text;
alter table public.centers add column if not exists locker_count integer;
update public.centers set locker_prefix = 'CL', locker_count = 40 where name = 'Calicut' and locker_prefix is null;
update public.centers set locker_prefix = 'CK', locker_count = 35 where name = 'Cochin' and locker_prefix is null;

create or replace function public.fets_check_in_one(p_candidate uuid, p_name_note text default null)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  v_from public.candidate_stage;
  v_note text := nullif(btrim(coalesce(p_name_note, '')), '');
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'front_office']::public.user_role[]);

  if c.status not in ('scheduled', 'arrived', 'id_checked') then
    raise exception 'already checked in (status is %)', c.status using errcode = 'P0001';
  end if;
  if v_note is not null and length(v_note) > 1000 then
    raise exception 'keep the name note under 1000 characters' using errcode = 'P0001';
  end if;

  v_from := c.status;
  update public.candidates
     set arrival_at = coalesce(arrival_at, now()),
         id_verified_at = coalesce(id_verified_at, now()),
         check_in_at = now(),
         status = 'waiting'
   where id = p_candidate
  returning * into c;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.checked_in', v_from, c.status,
    v_note, case when v_note is null then '{}'::jsonb else jsonb_build_object('name_mismatch', v_note) end);

  if v_note is not null then
    insert into public.incidents
      (center_id, exam_session_id, kind, severity, summary, detail, candidate_id,
       started_at, resolved_at, resolution, minutes_lost, reportable, logged_by, resolved_by)
    values
      (c.center_id, c.exam_session_id, 'candidate', 'minor',
       'Name on ID does not match the roster', v_note, c.id,
       now(), now(), 'Noted at check-in; candidate admitted.', 0, true, auth.uid(), auth.uid());
  end if;

  return c;
end;
$fn$;

revoke all on function public.fets_check_in_one(uuid, text) from public, anon, authenticated;
grant execute on function public.fets_check_in_one(uuid, text) to authenticated;

create or replace function public.fets_assign_locker(p_candidate uuid, p_key text)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  v_holder text;
  v_prefix text;
  v_count integer;
  v_key text := upper(btrim(coalesce(p_key, '')));
  v_n integer;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'front_office']::public.user_role[]);

  if c.status in ('completed', 'signed_out', 'no_show') then
    raise exception 'candidate is no longer in the hall' using errcode = 'P0001';
  end if;

  select locker_prefix, locker_count into v_prefix, v_count from public.centers where id = c.center_id;

  if v_key <> 'NIL' then
    if v_prefix is not null then
      if v_key !~ ('^' || v_prefix || '-[0-9]{2}$') then
        raise exception 'locker keys here are %-01 to %-%, or Nil', v_prefix, v_prefix, lpad(v_count::text, 2, '0')
          using errcode = 'P0001';
      end if;
      v_n := substring(v_key from '[0-9]{2}$')::integer;
      if v_n < 1 or v_n > v_count then
        raise exception 'there is no locker % here', v_key using errcode = 'P0001';
      end if;
    end if;

    select public_token into v_holder from public.candidates
     where exam_session_id = c.exam_session_id and locker_key = v_key and id <> p_candidate
       and status not in ('signed_out', 'no_show')
     limit 1;
    if v_holder is not null then
      raise exception 'locker % is already issued to %', v_key, v_holder using errcode = 'P0001';
    end if;
  end if;

  update public.candidates set locker_key = v_key where id = p_candidate returning * into c;
  perform public.fets_log_event(c.id, c.center_id, 'candidate.locker_issued', c.status, c.status, null,
    jsonb_build_object('locker_key', v_key));
  return c;
end;
$fn$;

do $$
declare
  d text;
  was text := 'select * into r from public.schedule_rules where center_id = c.center_id;';
begin
  d := pg_get_functiondef('public.fets_call_candidate(uuid, text)'::regprocedure);
  if position(was in d) = 0 then
    raise exception 'fets_call_candidate no longer reads its rules the way this migration expects';
  end if;
  execute replace(d, was, was || '

  if coalesce(r.locker_key_required, true) and c.locker_key is null then
    raise exception ''% needs a locker key, or Nil, before being called'', c.public_token
      using errcode = ''P0001'';
  end if;');
end
$$;
