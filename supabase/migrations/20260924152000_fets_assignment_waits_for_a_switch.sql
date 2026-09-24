-- Putting somebody on a post and that person switching centre cannot cross.
--
-- fets_switch_centre locks the profile and refuses while the person holds a
-- post. fets_start_duty read the profile without a lock, so an assignment
-- running at the same instant could check the old centre and insert a block
-- after the switch had looked and found none — a post at one centre held by
-- somebody working at the other. Taking a share lock on the profile makes the
-- two queue: whichever runs second sees what the first did and refuses.
-- Every other way onto a post (rotation, handover) goes through here.
do $$
declare
  d text;
  was text := 'select * into pf from public.profiles where id = p_profile;';
begin
  d := pg_get_functiondef(
    'public.fets_start_duty(uuid, uuid, integer, timestamptz, text)'::regprocedure);
  if position(was in d) = 0 then
    raise exception 'fets_start_duty no longer reads the profile the way this migration expects';
  end if;
  execute replace(d, was, 'select * into pf from public.profiles where id = p_profile for share;');
end
$$;
