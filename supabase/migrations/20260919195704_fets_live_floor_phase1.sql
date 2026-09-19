-- FETS Live Floor, phase 1: exam timing on the workstation.
-- The clock is server-side: we store the actual start and the duration, and
-- every screen derives the remaining time from those. Breaks never pause it.

create table if not exists public.exam_programmes (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  code text not null,
  name text not null,
  default_duration_minutes integer not null check (default_duration_minutes between 1 and 1440),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (center_id, code)
);

create index if not exists exam_programmes_center_idx on public.exam_programmes (center_id);

alter table public.exam_programmes enable row level security;

drop policy if exists staff_read_programmes on public.exam_programmes;
create policy staff_read_programmes on public.exam_programmes
  for select to authenticated using (center_id = public.current_center_id());

drop policy if exists admin_insert_programmes on public.exam_programmes;
create policy admin_insert_programmes on public.exam_programmes
  for insert to authenticated
  with check (center_id = public.current_center_id() and public.current_role() = 'admin');

drop policy if exists admin_update_programmes on public.exam_programmes;
create policy admin_update_programmes on public.exam_programmes
  for update to authenticated
  using (center_id = public.current_center_id() and public.current_role() = 'admin')
  with check (center_id = public.current_center_id() and public.current_role() = 'admin');

grant select, insert, update on public.exam_programmes to authenticated;

-- Exam timing lives on the candidate's single session record.
alter table public.candidates
  add column if not exists programme_id uuid references public.exam_programmes(id) on delete set null,
  add column if not exists exam_started_at timestamptz,
  add column if not exists exam_duration_minutes integer,
  add column if not exists exam_expected_end timestamptz,
  add column if not exists exam_finished_at timestamptz;

create index if not exists candidates_expected_end_idx
  on public.candidates (center_id, exam_expected_end)
  where exam_expected_end is not null and exam_finished_at is null;

-- Absence is tracked separately from the exam clock.
create table if not exists public.candidate_breaks (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  center_id uuid not null references public.centers(id) on delete cascade,
  kind text not null check (kind in ('scheduled', 'unscheduled')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  authorised_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists candidate_breaks_center_idx on public.candidate_breaks (center_id, started_at desc);
create index if not exists candidate_breaks_open_idx on public.candidate_breaks (candidate_id) where ended_at is null;

alter table public.candidate_breaks enable row level security;

drop policy if exists staff_read_breaks on public.candidate_breaks;
create policy staff_read_breaks on public.candidate_breaks
  for select to authenticated using (center_id = public.current_center_id());

grant select on public.candidate_breaks to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'candidate_breaks') then
      alter publication supabase_realtime add table public.candidate_breaks;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'exam_programmes') then
      alter publication supabase_realtime add table public.exam_programmes;
    end if;
  end if;
end
$$;
