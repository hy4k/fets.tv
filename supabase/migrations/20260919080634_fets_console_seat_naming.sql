-- Match the seat naming already in use at the center: lab "LAB A", seat "LAB A-01".
create or replace function public.fets_sync_workstations(p_center uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.schedule_rules;
  v_lab text;
  v_seat text;
  v_created integer := 0;
  i integer;
  j integer;
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  select * into r from public.schedule_rules where center_id = p_center;
  if not found then raise exception 'no schedule rules for this center' using errcode = 'P0002'; end if;

  for i in 1..r.labs_count loop
    v_lab := 'LAB ' || chr(64 + i);
    for j in 1..r.lab_capacity loop
      v_seat := v_lab || '-' || lpad(j::text, 2, '0');
      insert into public.workstations (center_id, lab_name, seat_code)
      values (p_center, v_lab, v_seat)
      on conflict (center_id, seat_code) do nothing;
      if found then v_created := v_created + 1; end if;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.fets_sync_workstations(uuid) from public, anon, authenticated;
grant execute on function public.fets_sync_workstations(uuid) to authenticated;
