-- A switch tells both centres, through a row each of them can see.
--
-- Realtime only delivers a change to somebody allowed to read the new row, and
-- once a profile has moved, the centre it left can no longer read it — so
-- that centre's screens never heard it go. Each console already listens to its
-- own centre's row, so the switch stamps both.
alter table public.centers add column if not exists staff_changed_at timestamptz;

do $$
declare
  d text;
  was text := 'update public.profiles set center_id = p_center where id = auth.uid()
  returning * into pf;';
begin
  d := pg_get_functiondef('public.fets_switch_centre(uuid)'::regprocedure);
  if position(was in d) = 0 then
    raise exception 'fets_switch_centre no longer moves the profile the way this migration expects';
  end if;
  execute replace(d, was,
    'update public.centers set staff_changed_at = now() where id in (pf.center_id, p_center);
  ' || was);
end
$$;
