-- The confirmation number is how a candidate is known now, at the desk and on
-- the TV, so a mistyped one has to be fixable from the Check-in page. If the
-- candidate is on the TV at that moment, the board's copy is corrected too.

create or replace function public.fets_set_confirmation_number(p_candidate uuid, p_number text)
returns public.candidates
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  c public.candidates;
  v text := btrim(coalesce(p_number, ''));
  v_other text;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'tca', 'front_office']::public.user_role[]);

  if v = '' then
    raise exception 'a confirmation number cannot be blank' using errcode = 'P0001';
  end if;
  if v = c.roster_number then
    return c;
  end if;

  select btrim(first_name || ' ' || last_name) into v_other from public.candidates
   where exam_session_id = c.exam_session_id and roster_number = v and id <> c.id
     and live_provider is not distinct from c.live_provider
   limit 1;
  if v_other is not null then
    raise exception 'confirmation number % is already % today', v, v_other using errcode = 'P0001';
  end if;

  update public.candidates set roster_number = v where id = c.id returning * into c;

  update public.public_display_calls set token = v
   where center_id = c.center_id and active and candidate_id = c.id;

  perform public.fets_log_event(c.id, c.center_id, 'details_edited', c.status, c.status,
    'confirmation number changed', jsonb_build_object('fields', jsonb_build_array('confirmation')));
  return c;
end;
$fn$;

revoke all on function public.fets_set_confirmation_number(uuid, text) from public, anon;
grant execute on function public.fets_set_confirmation_number(uuid, text) to authenticated;
