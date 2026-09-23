-- Setting up the rotation, and turning it.
--
-- Three people, three posts, ninety minutes, then everybody moves along one.
-- Doing that by hand is three handovers typed in a hurry while the floor waits,
-- and the one that gets missed is the one nobody notices until a board asks.
--
-- So it is two calls. Starting the rotation puts the three of them on the three
-- posts in order. Turning it moves each of them to the next post along, closing
-- and opening every block at the same instant so the record has no seam in it.

/**
 * Puts a set of people on the posts, in order, all starting together.
 *
 * The lists are paired by position: the first person takes the first post. Any
 * post beyond the end of the list is left as it is, and any extra person is
 * ignored rather than silently doubled up somewhere.
 */
create or replace function public.fets_start_rotation(
  p_center uuid,
  p_profiles uuid[],
  p_minutes integer default null,
  p_at timestamptz default null
)
returns setof public.duty_blocks
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_at timestamptz := coalesce(p_at, now());
  v_posts uuid[];
  i integer;
begin
  perform public.fets_guard(p_center, array['admin', 'tca']::public.user_role[]);

  if p_profiles is null or array_length(p_profiles, 1) is null then
    raise exception 'say who is on' using errcode = 'P0001';
  end if;

  if (select count(distinct x) from unnest(p_profiles) x) <> array_length(p_profiles, 1) then
    raise exception 'the same person cannot hold two posts at once' using errcode = 'P0001';
  end if;

  select array_agg(id order by position) into v_posts
    from public.duty_posts where center_id = p_center and active;

  if v_posts is null then
    raise exception 'this centre has no posts set up' using errcode = 'P0001';
  end if;

  if array_length(p_profiles, 1) > array_length(v_posts, 1) then
    raise exception 'there are more people than posts' using errcode = 'P0001';
  end if;

  -- Everybody comes off first, so nobody trips over the one-per-post rule on
  -- the way past somebody else's old position.
  update public.duty_blocks
     set ended_at = v_at
   where center_id = p_center
     and ended_at is null
     and started_at <= v_at;

  for i in 1 .. array_length(p_profiles, 1) loop
    perform public.fets_start_duty(v_posts[i], p_profiles[i], p_minutes, v_at);
  end loop;

  return query
    select b.* from public.duty_blocks b
     join public.duty_posts p on p.id = b.post_id
    where b.center_id = p_center and b.ended_at is null
    order by p.position;
end;
$fn$;

/**
 * Moves everybody along one post.
 *
 * Only the posts that are actually staffed take part, so a centre running two
 * of its three posts still rotates sensibly between the two. Every block closes
 * and its replacement opens at the same instant.
 */
create or replace function public.fets_rotate_duty(
  p_center uuid,
  p_minutes integer default null,
  p_at timestamptz default null
)
returns setof public.duty_blocks
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_at timestamptz := coalesce(p_at, now());
  v_posts uuid[];
  v_people uuid[];
  n integer;
  i integer;
begin
  perform public.fets_guard(p_center, array['admin', 'tca']::public.user_role[]);

  select array_agg(b.post_id order by p.position),
         array_agg(b.profile_id order by p.position)
    into v_posts, v_people
    from public.duty_blocks b
    join public.duty_posts p on p.id = b.post_id
   where b.center_id = p_center
     and b.ended_at is null
     and p.active
     and b.profile_id is not null;

  n := coalesce(array_length(v_posts, 1), 0);

  if n < 2 then
    raise exception 'there is nobody to rotate; put people on the posts first'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.duty_blocks
              where center_id = p_center and ended_at is null and started_at > v_at) then
    raise exception 'a duty here began after that time' using errcode = 'P0001';
  end if;

  update public.duty_blocks
     set ended_at = v_at
   where center_id = p_center and ended_at is null;

  -- Post i takes the person who was on the post before it, and the first post
  -- takes the person who was on the last.
  for i in 1 .. n loop
    perform public.fets_start_duty(
      v_posts[i], v_people[case when i = 1 then n else i - 1 end], p_minutes, v_at);
  end loop;

  return query
    select b.* from public.duty_blocks b
     join public.duty_posts p on p.id = b.post_id
    where b.center_id = p_center and b.ended_at is null
    order by p.position;
end;
$fn$;

revoke all on function
  public.fets_start_rotation(uuid, uuid[], integer, timestamptz),
  public.fets_rotate_duty(uuid, integer, timestamptz)
  from public, anon, authenticated;

grant execute on function
  public.fets_start_rotation(uuid, uuid[], integer, timestamptz),
  public.fets_rotate_duty(uuid, integer, timestamptz)
  to authenticated;
