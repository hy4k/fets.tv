-- Removing a post deleted every duty ever served on it.
--
-- fets_configure_duty_posts deleted the rows it no longer saw, and duty_blocks
-- cascades from the post -- so retiring "Relief" next year would quietly erase
-- the record of everybody who ever stood on it, including on days already
-- reported to a board. Every other part of this system goes the other way: a
-- material kind is deactivated rather than dropped, an observation copies the
-- name it was made under, a signed-off report is frozen.
--
-- A post is retired now, not deleted. It stops being offered and keeps its
-- history.

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

  -- Retiring a post somebody is standing on would leave their duty open on a
  -- post that is no longer offered, so it is refused while they are there.
  select string_agg(distinct dp.name, ', ' order by dp.name) into v_held
    from public.duty_posts dp
    join public.duty_blocks db on db.post_id = dp.id and db.ended_at is null
   where dp.center_id = p_center
     and dp.active
     and dp.name not in (
       select btrim(coalesce(x->>'name', '')) from jsonb_array_elements(p_posts) x);

  if v_held is not null then
    raise exception 'somebody is on % right now; hand the post over before removing it', v_held
      using errcode = 'P0001';
  end if;

  update public.duty_posts
     set active = false
   where center_id = p_center
     and active
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

    -- A name that comes back is the same post returning, not a new one: it
    -- keeps its id and therefore everything served on it before.
    insert into public.duty_posts (center_id, name, position, kind, lab_id)
    values (p_center, v_name, v_pos, v_kind, v_lab)
    on conflict (center_id, name) do update
       set position = excluded.position,
           kind = excluded.kind,
           lab_id = excluded.lab_id,
           active = true;
  end loop;

  return query
    select * from public.duty_posts
     where center_id = p_center and active order by position;
end;
$fn$;
