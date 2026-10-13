-- Seats carry the number painted on the desk.
--
-- A seat was only ever called by its code, "Lab 1-07", and the hyphen reads as
-- a range: staff saw "1 to 7" where they meant seat 7. And a second lab that
-- continues the numbering on the floor (Cochin's Lab 2 is seats 23 to 30) had
-- no way to say so. Now each seat has a number of its own, set in Setup, and
-- everything that names a seat says "Lab 1 · Seat 7".
--
-- The code stays as the seat's fixed identity: it is what keeps a seat the same
-- seat when a lab is resized, so only the number shown to people changes.

alter table public.workstations
  add column if not exists seat_label text;

-- How a seat is named to people. Its own number when one is set; otherwise
-- the number in its code without the leading zero.
create or replace function public.fets_seat_number(w public.workstations)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $fn$
  select case
           when w.id is null then null
           when nullif(btrim(w.seat_label), '') is not null then btrim(w.seat_label)
           when regexp_replace(w.seat_code, '^.*-', '') ~ '^[0-9]+$'
             then (regexp_replace(w.seat_code, '^.*-', ''))::integer::text
           else w.seat_code
         end
$fn$;

create or replace function public.fets_seat_name(w public.workstations)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $fn$
  select case
           when w.id is null then null
           else coalesce(nullif(btrim(w.lab_name), '') || ' · ', '') || 'Seat ' || public.fets_seat_number(w)
         end
$fn$;

-- Set the numbers for any seats at once. An empty number puts the standard one
-- back. Two seats in the same lab may not share a number.
create or replace function public.fets_set_seat_numbers(p_center uuid, p_numbers jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_item jsonb;
  v_id uuid;
  v_label text;
  v_changed integer := 0;
  v_clash text;
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  if jsonb_typeof(p_numbers) is distinct from 'array' then
    raise exception 'nothing to save' using errcode = 'P0001';
  end if;

  for v_item in select value from jsonb_array_elements(p_numbers) loop
    v_id := (v_item ->> 'id')::uuid;
    v_label := nullif(btrim(coalesce(v_item ->> 'number', '')), '');
    if v_label is not null and length(v_label) > 12 then
      raise exception 'a seat number is at most 12 characters' using errcode = 'P0001';
    end if;
    update public.workstations
       set seat_label = v_label
     where id = v_id and center_id = p_center
       and seat_label is distinct from v_label;
    if found then v_changed := v_changed + 1; end if;
  end loop;

  -- "A" and "a" are the same seat to a person reading the desk.
  select format('%s has seat %s twice', min(w.lab_name), min(public.fets_seat_number(w)))
    into v_clash
    from public.workstations w
   where w.center_id = p_center and w.lab_id is not null
   group by w.lab_id, lower(public.fets_seat_number(w))
  having count(*) > 1
   limit 1;
  if v_clash is not null then
    raise exception '%', v_clash using errcode = 'P0001';
  end if;

  return v_changed;
end;
$fn$;

revoke all on function public.fets_set_seat_numbers(uuid, jsonb) from public, anon;
grant execute on function public.fets_set_seat_numbers(uuid, jsonb) to authenticated;

-- What staff read about a seat — errors, the transfer incident, the problem
-- report — names it the same way. Each function is rewritten from what is
-- installed, so nothing else in it changes.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.fets_problem_report(uuid)'::regprocedure);
  v_new := replace(v_def, '''seat'', w.seat_code,', '''seat'', public.fets_seat_name(w),');
  if v_new = v_def and position('fets_seat_name' in v_def) = 0 then
    raise exception 'fets_problem_report no longer names seats the expected way';
  end if;
  execute v_new;

  v_def := pg_get_functiondef('public.fets_transfer_workstation(uuid,uuid,text,integer,boolean)'::regprocedure);
  v_new := replace(replace(v_def, 'w_to.seat_code', 'public.fets_seat_name(w_to)'),
                   'w_from.seat_code', 'public.fets_seat_name(w_from)');
  if v_new = v_def and position('fets_seat_name' in v_def) = 0 then
    raise exception 'fets_transfer_workstation no longer names seats the expected way';
  end if;
  execute v_new;

  v_def := pg_get_functiondef('public.fets_assign_workstation(uuid,uuid)'::regprocedure);
  v_new := replace(v_def, 'w.seat_code', 'public.fets_seat_name(w)');
  execute v_new;

  v_def := pg_get_functiondef('public.fets_set_workstation_status(uuid,text)'::regprocedure);
  v_new := replace(v_def, 'w.seat_code', 'public.fets_seat_name(w)');
  execute v_new;
end $$;
