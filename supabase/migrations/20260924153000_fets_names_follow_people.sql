-- Names for the record, whichever centre the person is at now.
--
-- Staff read profiles only at their own centre, which is right for the lists
-- people are picked from. But an incident logged at Calicut by somebody now
-- working at Cochin still needs to say who logged it. This hands every staff
-- member the names — and only the names — of everybody on staff.
create or replace function public.fets_staff_names()
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p.id, p.display_name
    from public.profiles p
   where exists (
     select 1 from public.profiles me
      where me.id = auth.uid() and me.role <> 'viewer');
$fn$;

revoke all on function public.fets_staff_names() from public, anon, authenticated;
grant execute on function public.fets_staff_names() to authenticated;
