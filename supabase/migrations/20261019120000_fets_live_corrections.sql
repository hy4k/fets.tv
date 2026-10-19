-- What staff correct here goes back to fets.live.
--
-- Candidates come across from fets.live, and the desk then fills in what the
-- upload lacked: a phone number, the place, a corrected name or exam part. That
-- was only ever saved here, so fets.live kept the older, incomplete copy.
--
-- Now a staff edit to a candidate that came from fets.live marks it "to send"
-- (live_push_pending). The console sends it within seconds of the save, and any
-- pull sends whatever is still waiting first, so a dropped connection loses
-- nothing. Only the fixed details go back -- name, phone, place (fets.live's
-- "address") and exam part -- matched on centre, day, provider and
-- confirmation number. Lockers, seats, clocks and outcomes stay here, and a
-- booked slot filled in at the desk is never sent, because fets.live has no
-- record for it and creating one would change its calendar count.
--
-- Run once in the fets.online Supabase project (ueufcqmdqtwvhjjyudeu).

begin;

alter table public.candidates
  add column if not exists live_push_pending boolean not null default false,
  add column if not exists live_pushed_at timestamptz;

create index if not exists candidates_live_push_pending_idx
  on public.candidates (center_id) where live_push_pending;

-- Every details edit already logs which fields changed; that is the signal.
create or replace function public.fets_mark_live_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.event_type = 'details_edited'
     and coalesce(new.metadata_json ->> 'slot', '') <> 'true'
     and jsonb_typeof(new.metadata_json -> 'fields') = 'array'
     and (new.metadata_json -> 'fields') ?| array['name', 'part', 'phone', 'place'] then
    update public.candidates
       set live_push_pending = true
     where id = new.candidate_id
       and live_provider is not null
       and not placeholder;
  end if;
  return new;
end;
$fn$;

drop trigger if exists candidate_events_live_push on public.candidate_events;
create trigger candidate_events_live_push
  after insert on public.candidate_events
  for each row execute function public.fets_mark_live_push();

-- What is waiting to go to fets.live for one centre, with the day and branch
-- fets.live needs to find each record.
create or replace function public.fets_live_push_queue(p_center uuid)
returns table (
  id uuid,
  roster_number text,
  live_provider text,
  exam_date date,
  center_name text,
  full_name text,
  phone text,
  place text,
  part text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select c.id, c.roster_number, c.live_provider, s.exam_date, ce.name,
         btrim(c.first_name || ' ' || c.last_name), c.phone, c.place, c.part
    from public.candidates c
    join public.exam_sessions s on s.id = c.exam_session_id
    join public.centers ce on ce.id = c.center_id
   where c.center_id = p_center
     and c.live_push_pending
     and c.live_provider is not null
     and not c.placeholder
   order by s.exam_date, c.roster_number
   limit 500
$fn$;

-- Sent: clear the flag, unless staff edited again while it was on its way.
create or replace function public.fets_live_push_done(p_ids uuid[], p_sent_at timestamptz)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $fn$
  with done as (
    update public.candidates c
       set live_push_pending = false, live_pushed_at = p_sent_at
     where c.id = any (p_ids)
       and not exists (
         select 1 from public.candidate_events e
          where e.candidate_id = c.id and e.event_type = 'details_edited' and e.occurred_at > p_sent_at)
    returning 1)
  select count(*)::integer from done
$fn$;

-- The server sends with the service key; nobody signed in calls these.
revoke all on function public.fets_live_push_queue(uuid) from public, anon, authenticated;
revoke all on function public.fets_live_push_done(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.fets_live_push_queue(uuid) to service_role;
grant execute on function public.fets_live_push_done(uuid[], timestamptz) to service_role;

commit;
