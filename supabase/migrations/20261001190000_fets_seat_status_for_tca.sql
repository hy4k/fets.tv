-- A seat marked faulty must be clearable by the people on the floor. Most
-- staff are TCA accounts, which this function used to refuse, so a fault set
-- during a transfer stayed red for good.

create or replace function public.fets_set_workstation_status(p_workstation uuid, p_status text)
returns public.workstations
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  w public.workstations;
begin
  select * into w from public.workstations where id = p_workstation for update;
  if not found then raise exception 'workstation not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(w.center_id, array['admin', 'tca', 'lab_staff']::public.user_role[]);

  if p_status not in ('free', 'active', 'assigned', 'cleaning', 'fault') then
    raise exception 'unknown workstation status %', p_status using errcode = 'P0001';
  end if;

  if p_status in ('free', 'fault', 'cleaning') and w.current_candidate_id is not null then
    raise exception 'workstation % still holds a candidate', w.seat_code using errcode = 'P0001';
  end if;

  update public.workstations set status = p_status where id = p_workstation returning * into w;
  return w;
end;
$function$;
