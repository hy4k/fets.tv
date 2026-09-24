-- The hall TV says which centre it is in.
--
-- With two centres, a screen that only says "HALL 1" is one mix-up away from
-- showing Calicut's calls in Cochin's hall unnoticed. The display state now
-- carries the centre's name, so the board can print it and wear its colours.
-- (The alias is ctr, not c: the function already has a record called c.)
do $$
declare
  d text;
  was text := '''label'', d.label,';
begin
  d := pg_get_functiondef('public.fets_display_state(text)'::regprocedure);
  if position(was in d) = 0 then
    raise exception 'fets_display_state no longer builds its label the way this migration expects';
  end if;
  execute replace(d, was,
    '''label'', d.label, ''centre'', (select ctr.name from public.centers ctr where ctr.id = d.center_id),');
end
$$;
