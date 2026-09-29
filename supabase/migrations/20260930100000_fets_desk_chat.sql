-- The desks talk to each other.
--
-- The front office and the admin room are different rooms, and the day runs on
-- small messages between them: "send the next one", "hold, the lab is full",
-- "T-07 is on the way". Shouting down a corridor or ringing a phone loses the
-- detail and leaves no record, so each message is a row: which desk it came
-- from, which desk it is for, who wrote it, optionally which candidate it is
-- about, and when the other desk saw it.

create table if not exists public.desk_messages (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  from_desk text not null check (from_desk in ('front', 'admin', 'lab', 'office')),
  to_desk text not null check (to_desk in ('front', 'admin', 'lab', 'office', 'all')),
  body text not null check (btrim(body) <> '' and length(body) <= 500),
  candidate_id uuid references public.candidates(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  seen_by uuid references public.profiles(id) on delete set null,
  check (from_desk <> to_desk)
);

create index if not exists desk_messages_day_idx on public.desk_messages (center_id, created_at desc);

alter table public.desk_messages enable row level security;

drop policy if exists staff_read_desk_messages on public.desk_messages;
create policy staff_read_desk_messages on public.desk_messages
  for select to authenticated using (center_id = public.current_center_id());

grant select on public.desk_messages to authenticated;

/** Sends a message from one desk to another. */
create or replace function public.fets_desk_send(
  p_center uuid,
  p_from text,
  p_to text,
  p_body text,
  p_candidate uuid default null
)
returns public.desk_messages
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  m public.desk_messages;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform public.fets_guard(
    p_center, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  if v_body = '' then
    raise exception 'write something to send' using errcode = 'P0001';
  end if;
  if p_from = p_to then
    raise exception 'pick the other desk' using errcode = 'P0001';
  end if;
  if p_candidate is not null
     and not exists (select 1 from public.candidates where id = p_candidate and center_id = p_center) then
    raise exception 'that candidate is not at this center' using errcode = 'P0002';
  end if;

  insert into public.desk_messages (center_id, from_desk, to_desk, body, candidate_id, author_id)
  values (p_center, p_from, p_to, left(v_body, 500), p_candidate, auth.uid())
  returning * into m;
  return m;
end;
$fn$;

/**
 * Marks everything sent to a desk, up to now, as seen by that desk. A message
 * for everybody is seen by the first desk that reads it.
 */
create or replace function public.fets_desk_seen(p_center uuid, p_desk text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  n integer;
begin
  perform public.fets_guard(
    p_center, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  update public.desk_messages
     set seen_at = now(), seen_by = auth.uid()
   where center_id = p_center
     and seen_at is null
     and from_desk <> p_desk
     and (to_desk = p_desk or to_desk = 'all');
  get diagnostics n = row_count;
  return n;
end;
$fn$;

revoke all on function public.fets_desk_send(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.fets_desk_send(uuid, text, text, text, uuid) to authenticated;
revoke all on function public.fets_desk_seen(uuid, text) from public, anon, authenticated;
grant execute on function public.fets_desk_seen(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'desk_messages') then
      alter publication supabase_realtime add table public.desk_messages;
    end if;
  end if;
end
$$;
