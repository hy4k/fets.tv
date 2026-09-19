-- Additive bridge between the deployed schema and the FETS Console UI.
-- Nothing here removes a grant or a policy, so the currently deployed app
-- keeps working.

alter table public.centers
  add column if not exists show_name_on_tv boolean not null default true;

-- Denormalised center on candidates and events: RLS and realtime filters both
-- want it without a join through exam_sessions.
alter table public.candidates add column if not exists center_id uuid references public.centers(id);
alter table public.candidates add column if not exists called_at timestamptz;

update public.candidates c
   set center_id = e.center_id
  from public.exam_sessions e
 where e.id = c.exam_session_id and c.center_id is distinct from e.center_id;

alter table public.candidates alter column center_id set not null;
create index if not exists candidates_center_idx on public.candidates(center_id);

-- One roster number per session; the live roster is already clean.
create unique index if not exists candidates_session_roster_idx
  on public.candidates(exam_session_id, roster_number);

alter table public.candidate_events add column if not exists center_id uuid references public.centers(id);

update public.candidate_events ev
   set center_id = c.center_id
  from public.candidates c
 where c.id = ev.candidate_id and ev.center_id is distinct from c.center_id;

alter table public.candidate_events alter column center_id set not null;
create index if not exists candidate_events_center_idx on public.candidate_events(center_id, occurred_at desc);

-- Workflow switches behind the Setup screen.
alter table public.schedule_rules
  add column if not exists frisking_enabled boolean not null default true,
  add column if not exists biometrics_enabled boolean not null default true,
  add column if not exists auto_resequence boolean not null default false,
  add column if not exists locker_key_required boolean not null default true,
  add column if not exists admin_override_log boolean not null default true;

-- Registered TVs. The plaintext key lives only in the display's URL.
create table if not exists public.public_displays (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  display_key_hash text not null unique,
  label text not null,
  hall_label text not null default 'HALL 1',
  active boolean not null default true,
  last_seen_at timestamptz
);

create index if not exists public_displays_center_idx on public.public_displays(center_id);

alter table public.public_displays enable row level security;

drop policy if exists staff_read_displays on public.public_displays;
create policy staff_read_displays on public.public_displays
  for select to authenticated
  using (center_id = public.current_center_id());

grant select on public.public_displays to authenticated;

-- The call log keeps its append-only shape; these columns carry what the board
-- renders. candidate_name is only ever written when the center allows it.
alter table public.public_display_calls
  add column if not exists candidate_id uuid references public.candidates(id) on delete set null,
  add column if not exists candidate_name text,
  add column if not exists room_label text,
  add column if not exists call_nonce integer not null default 0;

-- 0004 revoked this outright, which left the audit trail unreadable even though
-- staff_read_events allows it.
grant select on public.candidate_events to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'centers') then
      alter publication supabase_realtime add table public.centers;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workstations') then
      alter publication supabase_realtime add table public.workstations;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'schedule_rules') then
      alter publication supabase_realtime add table public.schedule_rules;
    end if;
  end if;
end
$$;
