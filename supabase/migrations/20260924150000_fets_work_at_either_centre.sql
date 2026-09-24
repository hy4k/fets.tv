-- Everybody on staff can work at either centre.
--
-- Calicut and Cochin are run by the same people learning the same job, so
-- anybody who is not a viewer may move themselves to the other centre and
-- back. "Where you are working" is the centre on your profile — every read
-- policy and every writer already keys off it — so switching changes that
-- one field and the whole console follows: the day, the staff list, the
-- posts you can take, and where your walks are logged.
--
-- One thing refuses: switching away while you still hold a post. A Floor
-- block at Calicut held by somebody now looking at Cochin is a hole in the
-- Calicut floor walk that nobody can see. Hand over or stand down first.

/** The centres anybody on staff may switch to. Names and codes only. */
create or replace function public.fets_centres()
returns table (id uuid, name text, site_code text, timezone text)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select c.id, c.name, c.site_code, c.timezone
    from public.centers c
   where c.active
     and exists (
       select 1 from public.profiles p
        where p.id = auth.uid() and p.role <> 'viewer')
   order by c.name;
$fn$;

revoke all on function public.fets_centres() from public, anon, authenticated;
grant execute on function public.fets_centres() to authenticated;

/** Move yourself to another centre. */
create or replace function public.fets_switch_centre(p_center uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pf public.profiles;
  v_post text;
  v_from text;
begin
  select * into pf from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'no staff profile for this login' using errcode = '42501';
  end if;
  if pf.role = 'viewer' then
    raise exception 'a viewer account cannot change centre' using errcode = '42501';
  end if;

  if not exists (select 1 from public.centers where id = p_center and active) then
    raise exception 'that centre is not open' using errcode = 'P0001';
  end if;

  if pf.center_id = p_center then
    return pf;
  end if;

  select p.name, c.name into v_post, v_from
    from public.duty_blocks b
    join public.duty_posts p on p.id = b.post_id
    join public.centers c on c.id = b.center_id
   where b.profile_id = auth.uid()
     and b.ended_at is null
   limit 1;

  if v_post is not null then
    raise exception 'you are still on % at %; hand over or stand down first', v_post, v_from
      using errcode = 'P0001';
  end if;

  update public.profiles set center_id = p_center where id = auth.uid()
  returning * into pf;
  return pf;
end;
$fn$;

revoke all on function public.fets_switch_centre(uuid) from public, anon, authenticated;
grant execute on function public.fets_switch_centre(uuid) to authenticated;
