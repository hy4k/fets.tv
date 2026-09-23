-- A duty survived its post being retired but not its person leaving.
--
-- duty_blocks.profile_id cascaded from profiles, so offboarding somebody -- or
-- deleting their auth user, which cascades to the profile -- erased every duty
-- they ever served, including on days already reported to a board. That is the
-- same loss the post fix just closed, from the other side.
--
-- The block carries the name it was served under now, taken at the moment the
-- person went on. The link to the profile stays for as long as the profile
-- does, and goes null rather than taking the record with it.

alter table public.duty_blocks add column if not exists profile_name text;

update public.duty_blocks db
   set profile_name = p.display_name
  from public.profiles p
 where p.id = db.profile_id and db.profile_name is null;

update public.duty_blocks
   set profile_name = 'Unknown'
 where profile_name is null;

alter table public.duty_blocks alter column profile_name set not null;
alter table public.duty_blocks alter column profile_id drop not null;

alter table public.duty_blocks drop constraint if exists duty_blocks_profile_id_fkey;
alter table public.duty_blocks
  add constraint duty_blocks_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete set null;

create or replace function public.fets_start_duty(
  p_post uuid,
  p_profile uuid,
  p_minutes integer default null,
  p_at timestamptz default null,
  p_note text default null
)
returns public.duty_blocks
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  dp public.duty_posts;
  db public.duty_blocks;
  pf public.profiles;
  v_at timestamptz := coalesce(p_at, now());
  v_minutes integer;
  v_open public.duty_blocks;
begin
  select * into dp from public.duty_posts where id = p_post;
  if not found then raise exception 'no such post' using errcode = 'P0002'; end if;

  perform public.fets_guard(dp.center_id, array['admin', 'tca']::public.user_role[]);

  select * into pf from public.profiles where id = p_profile;
  if not found or pf.center_id <> dp.center_id then
    raise exception 'that person does not work at this centre' using errcode = 'P0002';
  end if;

  if not dp.active then
    raise exception '% is not a post any more', dp.name using errcode = 'P0001';
  end if;

  if v_at > now() + interval '5 minutes' then
    raise exception 'a duty cannot start in the future' using errcode = 'P0001';
  end if;

  if p_minutes is not null and (p_minutes < 15 or p_minutes > 480) then
    raise exception 'a block runs between 15 minutes and eight hours' using errcode = 'P0001';
  end if;

  select * into v_open from public.duty_blocks
   where post_id = p_post and ended_at is null
   for update;

  if v_open.profile_id = p_profile then
    raise exception '% is already on %', pf.display_name, dp.name using errcode = 'P0001';
  end if;

  if v_open.id is not null then
    if v_at < v_open.started_at then
      raise exception 'that is before the current duty began' using errcode = 'P0001';
    end if;
    update public.duty_blocks set ended_at = v_at where id = v_open.id;
  end if;

  select coalesce(p_minutes, r.duty_block_minutes, 90) into v_minutes
    from public.schedule_rules r where r.center_id = dp.center_id;
  v_minutes := coalesce(v_minutes, 90);

  -- The name is copied in, not looked up later: this row is the record of who
  -- stood there, and a record that empties when somebody leaves is not one.
  insert into public.duty_blocks
    (center_id, post_id, profile_id, profile_name, started_at, minutes, note, started_by)
  values (dp.center_id, dp.id, p_profile, pf.display_name, v_at, v_minutes,
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning * into db;

  return db;
end;
$fn$;
