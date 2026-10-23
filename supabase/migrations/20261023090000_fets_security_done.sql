-- Security and biometrics in one tick, in the admin room.
--
-- A called candidate used to wait for the front desk to press "Send to admin"
-- before the admin room could seat them. The front desk no longer sees calls at
-- all: the admin room calls, watches the person through the gate, and ticks
-- "Security & biometrics done" itself. That one tick stamps both steps, takes
-- the name off the hall TV and puts the candidate in "Ready for a seat".
--
-- Run once in the fets.online Supabase project (ueufcqmdqtwvhjjyudeu). Until it
-- is run the tick says the database needs updating and nothing else changes.

create or replace function public.fets_security_done(p_center uuid, p_candidate uuid)
returns public.candidates
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  c public.candidates;
  v_from public.candidate_stage;
begin
  perform public.fets_guard(p_center, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  select * into c from public.candidates where id = p_candidate and center_id = p_center for update;
  if not found then
    raise exception 'candidate not found at this centre' using errcode = 'P0002';
  end if;

  -- Called and on the way, or part-way through under the old two-step flow.
  if not (c.status in ('frisking', 'biometrics') or (c.status = 'waiting' and c.called_at is not null)) then
    raise exception 'only somebody who has been called can go through security' using errcode = 'P0001';
  end if;

  v_from := c.status;
  update public.candidates
     set status = 'assigned',
         called_at = null,
         frisked_at = coalesce(frisked_at, now()),
         biometrics_at = coalesce(biometrics_at, now())
   where id = c.id
  returning * into c;

  -- Through the gate: the name comes off the hall TV.
  update public.public_display_calls set active = false
   where center_id = p_center and active and candidate_id = c.id;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.security_done', v_from, c.status);
  return c;
end;
$fn$;

revoke all on function public.fets_security_done(uuid, uuid) from public, anon;
grant execute on function public.fets_security_done(uuid, uuid) to authenticated;
