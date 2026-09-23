-- The three tables the console writes without going through a function.
--
-- Changing fets_guard opened every RPC to staff, which is most of the console,
-- but the Setup screen edits three tables straight from the browser. Those are
-- governed by row level security rather than by the guard, so they stayed shut.
--
-- Two of the three were shut to an admin as well. `centers` and `workstations`
-- have write grants to `authenticated` and no write policy at all, which in
-- Postgres means every write is denied and the denial looks like a successful
-- update of zero rows -- so the centre name field on Setup has never saved, for
-- anybody, and said nothing about it. Only `centers` is actually written by the
-- console; `workstations` is left alone rather than opened speculatively.

-- Only these three, because only these three are written directly. Everything
-- else reaches the database through a security-definer function and is already
-- covered by the guard.

drop policy if exists staff_update_centers on public.centers;
create policy staff_update_centers on public.centers
  for update to authenticated
  using (id = public.current_center_id() and public.current_role() <> 'viewer')
  with check (id = public.current_center_id() and public.current_role() <> 'viewer');

drop policy if exists admin_insert_programmes on public.exam_programmes;
drop policy if exists admin_update_programmes on public.exam_programmes;

create policy staff_insert_programmes on public.exam_programmes
  for insert to authenticated
  with check (center_id = public.current_center_id() and public.current_role() <> 'viewer');

create policy staff_update_programmes on public.exam_programmes
  for update to authenticated
  using (center_id = public.current_center_id() and public.current_role() <> 'viewer')
  with check (center_id = public.current_center_id() and public.current_role() <> 'viewer');

drop policy if exists staff_write_rules on public.schedule_rules;
drop policy if exists staff_insert_rules on public.schedule_rules;
drop policy if exists staff_update_rules on public.schedule_rules;

create policy staff_insert_rules on public.schedule_rules
  for insert to authenticated
  with check (center_id = public.current_center_id() and public.current_role() <> 'viewer');

create policy staff_update_rules on public.schedule_rules
  for update to authenticated
  using (center_id = public.current_center_id() and public.current_role() <> 'viewer')
  with check (center_id = public.current_center_id() and public.current_role() <> 'viewer');

/**
 * Setting a PIN: your own, or anybody's.
 *
 * This is the one that was asked for by name, and the one that costs
 * something. The handover signature means what it means because nobody else
 * can set your PIN; now anybody on staff can, so a colleague's acceptance of a
 * post can be manufactured. Among three people who trust each other that is a
 * fair trade against being locked out at eight in the morning. It stops being
 * fair as the centre grows, and this function is the single place to narrow
 * when it does.
 */
create or replace function public.fets_set_pin(
  p_profile uuid,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  pf public.profiles;
  me public.profiles;
begin
  select * into pf from public.profiles where id = p_profile;
  if not found then raise exception 'no such person' using errcode = 'P0002'; end if;

  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.center_id <> pf.center_id then
    raise exception 'that person is not at your centre' using errcode = 'P0002';
  end if;

  if me.id <> pf.id and me.role = 'viewer' then
    raise exception 'a viewer may look but not change anything' using errcode = '42501';
  end if;

  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'a PIN is four to six digits' using errcode = 'P0001';
  end if;

  if p_pin in ('0000', '1111', '1234', '000000', '111111', '123456', '123123') then
    raise exception 'choose a PIN that is not that one' using errcode = 'P0001';
  end if;

  insert into public.staff_pins (profile_id, center_id, pin_hash, set_by)
  values (p_profile, pf.center_id,
          extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), auth.uid())
  on conflict (profile_id) do update
     set pin_hash = excluded.pin_hash,
         set_at = now(),
         set_by = auth.uid(),
         failed_attempts = 0,
         locked_until = null;

  update public.profiles set pin_set_at = now() where id = p_profile;
end;
$fn$;
