-- Who is in, which day.
--
-- The rotation needs three people on the floor. Whether there will be three
-- next Tuesday is not something the console could answer, so nobody found out
-- until Tuesday. This is the week ahead: three names down the side, the days
-- across, and a count under each day that goes red when it is short.
--
-- Only the exceptions are stored. Everybody is in unless a row says otherwise,
-- which is true of a three-person centre and means an untouched week reads as
-- a full week rather than as an empty one. Marking somebody back in deletes
-- their row rather than writing 'in', so the table only ever holds departures
-- from the norm and can be read at a glance in psql.

create table if not exists public.staff_days (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,

  /** Null once they have left; the name below outlives them, as everywhere. */
  profile_id uuid references public.profiles(id) on delete set null,
  profile_name text not null,

  on_date date not null,

  /** 'in' is not a value here. A row means somebody is not fully in. */
  state text not null check (state in ('off', 'half')),

  set_by uuid references auth.users(id),
  set_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- One answer per person per day. Rows orphaned by a departure hold a null
-- profile_id, which does not collide, so the history stays and the living
-- rota is still one row per person per day.
create unique index if not exists staff_days_one_per_person_per_day
  on public.staff_days (center_id, profile_id, on_date)
  where profile_id is not null;

create index if not exists staff_days_center_date_idx
  on public.staff_days (center_id, on_date);

alter table public.staff_days enable row level security;

drop policy if exists staff_days_read on public.staff_days;
create policy staff_days_read on public.staff_days
  for select to authenticated
  using (center_id = (select center_id from public.profiles where id = auth.uid()));

revoke all on public.staff_days from public, anon, authenticated;
grant select on public.staff_days to authenticated;

/**
 * Marks somebody in, off, or on a half day.
 *
 * 'in' deletes the row, because in is the absence of an exception. The date is
 * bounded not because a rota two years out is forbidden but because a date two
 * years out is almost always a typo, and a stray row nobody can see is worse
 * than a refusal they can read.
 */
create or replace function public.fets_set_staff_day(
  p_profile uuid,
  p_date date,
  p_state text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pf public.profiles;
begin
  select * into pf from public.profiles where id = p_profile;
  if not found then raise exception 'no such person' using errcode = 'P0002'; end if;

  perform public.fets_guard(pf.center_id, array['admin', 'tca']::public.user_role[]);

  if p_state not in ('in', 'off', 'half') then
    raise exception 'a day is in, off or half' using errcode = 'P0001';
  end if;

  if p_date < current_date - interval '1 year'
     or p_date > current_date + interval '1 year' then
    raise exception 'that date is more than a year away' using errcode = 'P0001';
  end if;

  if p_state = 'in' then
    delete from public.staff_days
     where center_id = pf.center_id and profile_id = p_profile and on_date = p_date;
    return;
  end if;

  insert into public.staff_days (center_id, profile_id, profile_name, on_date, state, set_by)
  values (pf.center_id, p_profile, pf.display_name, p_date, p_state, auth.uid())
  on conflict (center_id, profile_id, on_date) where profile_id is not null
  do update set state = excluded.state,
                profile_name = excluded.profile_name,
                set_by = auth.uid(),
                set_at = now();
end;
$fn$;

revoke all on function public.fets_set_staff_day(uuid, date, text)
  from public, anon, authenticated;
grant execute on function public.fets_set_staff_day(uuid, date, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public'
                      and tablename = 'staff_days') then
      alter publication supabase_realtime add table public.staff_days;
    end if;
  end if;
end
$$;
