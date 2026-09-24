-- Everybody who works here can run the place.
--
-- The roles were drawn for a centre with a front desk, a lab team and an
-- administrator who owned the settings. FETS does not work that way: three
-- people rotate through every post in a day, and the one who happens to be at
-- the desk when a seat needs adding is the one who should add it. A screen
-- that says "only an admin can do this" to somebody who is, in every practical
-- sense, running the centre, is a screen that gets worked around.
--
-- So the guard stops asking which role and starts asking whether they are
-- staff at all. `viewer` remains exactly what it was -- read and nothing else,
-- which is what a retired login or an observer should have.
--
-- Mithun asked for this explicitly, including for PINs, having been told what
-- it costs. Recording the cost here rather than only in a pull request: the
-- handover signature means something because nobody else can set your PIN. Any
-- member of staff can now set anybody's, so somebody could set a colleague's
-- PIN, type it, and leave a record saying that colleague accepted the post.
-- Among three people who trust each other that is a reasonable trade for not
-- being blocked at eight in the morning. It stops being reasonable at ten
-- people, and the thing to reach for then is a narrower exception for
-- fets_set_pin rather than the old role table.

create or replace function public.fets_guard(p_center uuid, p_roles public.user_role[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role;
  v_center uuid;
begin
  select role, center_id into v_role, v_center from public.profiles where id = auth.uid();

  if v_center is null then
    raise exception 'no operator profile for this user' using errcode = '42501';
  end if;

  if v_center <> p_center then
    raise exception 'operator belongs to a different center' using errcode = '42501';
  end if;

  -- Staff may do anything at their own centre. The p_roles argument is kept,
  -- and every call site keeps passing it, because it still documents who the
  -- action was drawn for and is what a future narrower rule would read.
  if v_role <> 'viewer' then
    return;
  end if;

  raise exception 'a viewer may look but not change anything' using errcode = '42501';
end;
$$;
