-- Who is standing where, and for how much longer.
--
-- Nobody works one post all day. The duty roster rotates people every ninety
-- minutes or so -- attention goes after that, and a board expects to be told
-- who was on the floor at the minute something went wrong. Until now the
-- console knew what happened to every candidate and nothing at all about the
-- people making it happen.
--
-- A post is a place with a job attached. A block is one person on one post from
-- a time, for a length. Only one person holds a post at a time, which the
-- database enforces rather than trusting the rota.

create table if not exists public.duty_posts (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  name text not null check (btrim(name) <> '' and length(name) <= 60),
  position integer not null check (position > 0 and position <= 40),

  -- What the post is responsible for. A lab post is the one that has to walk
  -- the floor; the front desk is the one that signs people out.
  kind text not null default 'floating'
    check (kind in ('front', 'admin', 'lab', 'floating')),
  lab_id uuid references public.labs(id) on delete set null,

  active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint duty_posts_named_once unique (center_id, name)
);

create index if not exists duty_posts_center_idx on public.duty_posts (center_id, position);

alter table public.duty_posts enable row level security;

drop policy if exists duty_posts_read on public.duty_posts;
create policy duty_posts_read on public.duty_posts
  for select to authenticated
  using (center_id = (select center_id from public.profiles where id = auth.uid()));

revoke all on public.duty_posts from public, anon, authenticated;
grant select on public.duty_posts to authenticated;

/**
 * One person on one post, from a time.
 *
 * `ended_at` null means they are on it now. The partial unique index is the
 * whole guarantee: a post cannot have two people on it, so "who is on Lab 1"
 * always has exactly one answer.
 */
create table if not exists public.duty_blocks (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  post_id uuid not null references public.duty_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,

  started_at timestamptz not null default now(),
  /** How long the block is meant to run. The end is worked out, not stored. */
  minutes integer not null default 90 check (minutes >= 15 and minutes <= 480),
  ended_at timestamptz,

  note text check (note is null or length(note) <= 2000),
  started_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  constraint duty_blocks_end_after_start check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists duty_blocks_one_per_post
  on public.duty_blocks (post_id) where ended_at is null;

create index if not exists duty_blocks_center_idx
  on public.duty_blocks (center_id, started_at desc);
create index if not exists duty_blocks_profile_idx
  on public.duty_blocks (profile_id, started_at desc);

alter table public.duty_blocks enable row level security;

drop policy if exists duty_blocks_read on public.duty_blocks;
create policy duty_blocks_read on public.duty_blocks
  for select to authenticated
  using (center_id = (select center_id from public.profiles where id = auth.uid()));

revoke all on public.duty_blocks from public, anon, authenticated;
grant select on public.duty_blocks to authenticated;

-- How long a block runs here by default. Ninety minutes is the usual answer and
-- the reason this exists, but a centre that rotates on the hour should not have
-- to fight the console about it.
alter table public.schedule_rules
  add column if not exists duty_block_minutes integer not null default 90;

alter table public.schedule_rules
  drop constraint if exists schedule_rules_duty_block_minutes_check;
alter table public.schedule_rules
  add constraint schedule_rules_duty_block_minutes_check
  check (duty_block_minutes >= 15 and duty_block_minutes <= 480);

/** Sets the posts a centre has. Replace-all, the same as labs and exam parts. */
create or replace function public.fets_configure_duty_posts(
  p_center uuid,
  p_posts jsonb
)
returns setof public.duty_posts
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_item jsonb;
  v_pos integer := 0;
  v_name text;
  v_kind text;
  v_lab uuid;
  v_held text;
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  if jsonb_typeof(coalesce(p_posts, 'null'::jsonb)) <> 'array' then
    raise exception 'give the posts as a list' using errcode = 'P0001';
  end if;

  -- Retiring a post somebody is standing on would delete the record of them
  -- standing on it, so it is refused while they are there.
  select string_agg(distinct dp.name, ', ' order by dp.name) into v_held
    from public.duty_posts dp
    join public.duty_blocks db on db.post_id = dp.id and db.ended_at is null
   where dp.center_id = p_center
     and dp.name not in (
       select btrim(coalesce(x->>'name', '')) from jsonb_array_elements(p_posts) x);

  if v_held is not null then
    raise exception 'somebody is on % right now; hand the post over before removing it', v_held
      using errcode = 'P0001';
  end if;

  delete from public.duty_posts
   where center_id = p_center
     and name not in (
       select btrim(coalesce(x->>'name', '')) from jsonb_array_elements(p_posts) x);

  for v_item in select * from jsonb_array_elements(p_posts) loop
    v_pos := v_pos + 1;
    v_name := btrim(coalesce(v_item->>'name', ''));
    v_kind := coalesce(nullif(btrim(coalesce(v_item->>'kind', '')), ''), 'floating');
    v_lab := nullif(v_item->>'lab_id', '')::uuid;

    if v_name = '' then
      raise exception 'post % has no name', v_pos using errcode = 'P0001';
    end if;

    if v_lab is not null
       and not exists (select 1 from public.labs where id = v_lab and center_id = p_center) then
      raise exception 'that lab is not at this centre' using errcode = 'P0002';
    end if;

    insert into public.duty_posts (center_id, name, position, kind, lab_id)
    values (p_center, v_name, v_pos, v_kind, v_lab)
    on conflict (center_id, name) do update
       set position = excluded.position,
           kind = excluded.kind,
           lab_id = excluded.lab_id,
           active = true;
  end loop;

  return query
    select * from public.duty_posts where center_id = p_center order by position;
end;
$fn$;

/**
 * Puts somebody on a post.
 *
 * Whoever was on it comes off at the same instant, so the two blocks meet
 * rather than overlapping or leaving a gap the roster cannot explain. Handing a
 * post to the person already on it is refused: that is a mis-tap, not a
 * rotation, and it would end their block and start a new one with their own
 * time reset.
 */
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

  insert into public.duty_blocks
    (center_id, post_id, profile_id, started_at, minutes, note, started_by)
  values (dp.center_id, dp.id, p_profile, v_at, v_minutes,
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning * into db;

  return db;
end;
$fn$;

/** Takes somebody off a post with nobody replacing them -- the end of a day. */
create or replace function public.fets_end_duty(
  p_block uuid,
  p_at timestamptz default null
)
returns public.duty_blocks
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  db public.duty_blocks;
  v_at timestamptz := coalesce(p_at, now());
begin
  select * into db from public.duty_blocks where id = p_block for update;
  if not found then raise exception 'no such duty' using errcode = 'P0002'; end if;

  perform public.fets_guard(db.center_id, array['admin', 'tca']::public.user_role[]);

  if db.ended_at is not null then
    raise exception 'that duty has already ended' using errcode = 'P0001';
  end if;

  if v_at < db.started_at then
    raise exception 'that is before the duty began' using errcode = 'P0001';
  end if;

  update public.duty_blocks set ended_at = v_at where id = p_block returning * into db;
  return db;
end;
$fn$;

revoke all on function
  public.fets_configure_duty_posts(uuid, jsonb),
  public.fets_start_duty(uuid, uuid, integer, timestamptz, text),
  public.fets_end_duty(uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function
  public.fets_configure_duty_posts(uuid, jsonb),
  public.fets_start_duty(uuid, uuid, integer, timestamptz, text),
  public.fets_end_duty(uuid, timestamptz)
  to authenticated;

-- A centre with no posts has nothing to show, so every centre starts with the
-- rooms it actually has: the desk, the admin room, one post per lab, and a
-- relief. All of it editable afterwards.
insert into public.duty_posts (center_id, name, position, kind, lab_id)
select c.id, 'Front desk', 1, 'front', null from public.centers c
on conflict (center_id, name) do nothing;

insert into public.duty_posts (center_id, name, position, kind, lab_id)
select c.id, 'Admin room', 2, 'admin', null from public.centers c
on conflict (center_id, name) do nothing;

insert into public.duty_posts (center_id, name, position, kind, lab_id)
select l.center_id, l.name, 2 + l.position, 'lab', l.id from public.labs l
on conflict (center_id, name) do nothing;

insert into public.duty_posts (center_id, name, position, kind, lab_id)
select c.id, 'Relief', 20, 'floating', null from public.centers c
on conflict (center_id, name) do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public'
                      and tablename = 'duty_blocks') then
      alter publication supabase_realtime add table public.duty_blocks;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public'
                      and tablename = 'duty_posts') then
      alter publication supabase_realtime add table public.duty_posts;
    end if;
  end if;
end
$$;
