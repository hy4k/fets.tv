-- Two labs, of the sizes each centre actually has. The old schedule_rules
-- carried one labs_count and one lab_capacity, which can only describe labs of
-- equal size; Calicut's are 30 and 10 and Cochin's are 22 and 8, so the labs
-- become rows of their own.

create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  name text not null,
  position integer not null,
  capacity integer not null check (capacity between 1 and 200),
  created_at timestamptz not null default now(),
  unique (center_id, name),
  unique (center_id, position)
);

alter table public.labs enable row level security;

-- A seat belongs to a lab. The column is nullable because seats created before
-- this migration have no lab row to point at; the console shows only seats that
-- do, so a retired bank disappears from the floor without its history being
-- deleted out from under the candidates who sat at it.
alter table public.workstations
  add column if not exists lab_id uuid references public.labs(id) on delete restrict;

create index if not exists workstations_lab_id_idx on public.workstations (lab_id);

drop policy if exists labs_read on public.labs;
create policy labs_read on public.labs
  for select to authenticated
  using (center_id = (select center_id from public.profiles where id = auth.uid()));

revoke all on public.labs from public, anon, authenticated;
grant select on public.labs to authenticated;

/**
 * Deletes a seat, but only when nothing depends on it: no occupant, status
 * free, and no candidate row still pointing at it. Returns false instead of
 * raising, so a caller can retire a whole bank and report what it could not
 * touch rather than failing the lot.
 */
create or replace function public.fets_retire_seat(p_center uuid, p_seat text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
  v_status text;
  v_occupant uuid;
begin
  select id, status, current_candidate_id into v_id, v_status, v_occupant
    from public.workstations
   where center_id = p_center and seat_code = p_seat;

  if v_id is null then return true; end if;
  if v_occupant is not null or v_status <> 'free' then return false; end if;
  if exists (select 1 from public.candidates where workstation_id = v_id) then return false; end if;

  delete from public.workstations where id = v_id;
  return true;
end;
$fn$;

/**
 * Sets a centre's labs to exactly the list given, and its seats to match.
 *
 * Growing a lab adds seats. Shrinking one removes the seats off the end, and a
 * lab left out of the list is retired altogether -- but only where the seats
 * involved are empty. Anything still in use is kept and named in the result,
 * because losing a seat mid-exam loses the record of who sat there.
 */
create or replace function public.fets_configure_labs(p_center uuid, p_labs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_lab jsonb;
  v_name text;
  v_capacity integer;
  v_position integer := 0;
  v_lab_id uuid;
  v_inserted boolean;
  v_keep uuid[] := '{}';
  v_doomed text[] := '{}';
  v_seat text;
  v_added integer := 0;
  v_removed integer := 0;
  v_blocked text[] := '{}';
  i integer;
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  if jsonb_typeof(p_labs) <> 'array' or jsonb_array_length(p_labs) = 0 then
    raise exception 'give at least one lab' using errcode = 'P0001';
  end if;

  -- The positions are rewritten from scratch, and both (center, name) and
  -- (center, position) are unique, so a reorder would collide with itself
  -- halfway through. Parking every position out of range first avoids that.
  update public.labs set position = -position where center_id = p_center and position > 0;

  for v_lab in select * from jsonb_array_elements(p_labs) loop
    v_position := v_position + 1;
    v_name := btrim(coalesce(v_lab ->> 'name', ''));
    v_capacity := coalesce((v_lab ->> 'capacity')::integer, 0);

    if v_name = '' then raise exception 'every lab needs a name' using errcode = 'P0001'; end if;
    if v_capacity < 1 then
      raise exception 'lab % needs at least one seat', v_name using errcode = 'P0001';
    end if;

    insert into public.labs (center_id, name, position, capacity)
    values (p_center, v_name, v_position, v_capacity)
    on conflict (center_id, name)
      do update set position = excluded.position, capacity = excluded.capacity
    returning id into v_lab_id;

    v_keep := array_append(v_keep, v_lab_id);

    for i in 1..v_capacity loop
      v_seat := v_name || '-' || lpad(i::text, 2, '0');
      -- xmax is zero on a row this statement inserted, and non-zero on one it
      -- updated, which is the only way to tell the two apart from an upsert.
      insert into public.workstations (center_id, lab_id, lab_name, seat_code)
      values (p_center, v_lab_id, v_name, v_seat)
      on conflict (center_id, seat_code)
        do update set lab_id = excluded.lab_id, lab_name = excluded.lab_name
      returning (xmax = 0) into v_inserted;
      if v_inserted then v_added := v_added + 1; end if;
    end loop;
  end loop;

  -- Everything that should no longer exist: seats past a shrunken lab's new
  -- capacity, seats of a lab left out of the list, and seats that never
  -- belonged to one. Collected first, deleted after, so nothing is removed from
  -- underneath a query that is still reading the table.
  select coalesce(array_agg(w.seat_code order by w.seat_code), '{}')
    into v_doomed
    from public.workstations w
    left join public.labs l on l.id = w.lab_id
   where w.center_id = p_center
     and (
       w.lab_id is null
       or not (w.lab_id = any (v_keep))
       or coalesce(nullif(regexp_replace(w.seat_code, '^.*-', ''), '')::integer, 0) > l.capacity
     );

  foreach v_seat in array v_doomed loop
    if public.fets_retire_seat(p_center, v_seat) then
      v_removed := v_removed + 1;
    else
      v_blocked := array_append(v_blocked, v_seat);
    end if;
  end loop;

  delete from public.labs l
   where l.center_id = p_center
     and not (l.id = any (v_keep))
     and not exists (select 1 from public.workstations w where w.lab_id = l.id);

  return jsonb_build_object(
    'seats_added', v_added,
    'seats_removed', v_removed,
    'seats_kept_in_use', to_jsonb(v_blocked)
  );
end;
$fn$;

revoke all on function
  public.fets_configure_labs(uuid, jsonb),
  public.fets_retire_seat(uuid, text)
  from public, anon, authenticated;

grant execute on function public.fets_configure_labs(uuid, jsonb) to authenticated;
