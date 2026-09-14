create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'front_office', 'lab_staff', 'viewer');
create type public.candidate_stage as enum ('scheduled', 'arrived', 'id_checked', 'waiting', 'frisking', 'biometrics', 'assigned', 'lab_entry', 'testing', 'completed', 'signed_out', 'no_show');

create table public.centers (
  id uuid primary key default gen_random_uuid(),
  site_code text not null unique,
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  center_id uuid not null references public.centers(id),
  display_name text not null,
  role public.user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

create table public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id),
  exam_date date not null,
  exam_name text not null,
  source_filename text,
  status text not null default 'draft' check (status in ('draft', 'ready', 'live', 'closed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.schedule_rules (
  center_id uuid primary key references public.centers(id) on delete cascade,
  slot_interval_minutes integer not null default 15 check (slot_interval_minutes > 0),
  exam_duration_minutes integer not null default 90 check (exam_duration_minutes > 0),
  labs_count integer not null default 3 check (labs_count > 0),
  lab_capacity integer not null default 20 check (lab_capacity > 0),
  exam_start time not null default '09:00',
  exam_end time not null default '17:00',
  break_start time,
  break_minutes integer not null default 30 check (break_minutes >= 0),
  updated_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references public.exam_sessions(id) on delete cascade,
  source_row integer,
  roster_number text,
  first_name text not null,
  last_name text not null,
  part text,
  phone text,
  place text,
  roster_flag text,
  public_token text not null,
  status public.candidate_stage not null default 'scheduled',
  scheduled_at timestamptz,
  arrival_at timestamptz,
  check_in_at timestamptz,
  id_verified_at timestamptz,
  locker_key text,
  frisked_at timestamptz,
  biometrics_at timestamptz,
  workstation_id uuid,
  lab_entry_at timestamptz,
  testing_started_at timestamptz,
  completed_at timestamptz,
  signed_out_at timestamptz,
  created_at timestamptz not null default now(),
  unique (exam_session_id, public_token)
);

create table public.workstations (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  lab_name text not null,
  seat_code text not null,
  status text not null default 'free' check (status in ('free', 'active', 'assigned', 'cleaning', 'fault')),
  current_candidate_id uuid references public.candidates(id),
  unique (center_id, seat_code)
);

create table public.candidate_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  from_status public.candidate_stage,
  to_status public.candidate_stage not null,
  event_type text not null,
  operator_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  note text,
  metadata_json jsonb not null default '{}'::jsonb
);

create table public.public_display_calls (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  display_key text not null,
  token text not null,
  instruction text not null,
  hall text not null default 'HALL 1',
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index candidates_session_status_idx on public.candidates(exam_session_id, status);
create index events_candidate_time_idx on public.candidate_events(candidate_id, occurred_at desc);
create index display_calls_center_time_idx on public.public_display_calls(center_id, created_at desc);

create or replace function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.transition_candidate(
  p_candidate_id uuid,
  p_to_status public.candidate_stage,
  p_note text default null,
  p_locker_key text default null,
  p_workstation_id uuid default null
)
returns public.candidates
language plpgsql security definer set search_path = public
as $$
declare
  v_candidate public.candidates;
  v_from public.candidate_stage;
  v_now timestamptz := now();
begin
  if public.current_role() is null or public.current_role() not in ('admin', 'front_office', 'lab_staff') then
    raise exception 'This role cannot transition candidates';
  end if;

  select * into v_candidate from public.candidates where id = p_candidate_id for update;
  if not found then raise exception 'Candidate not found'; end if;
  v_from := v_candidate.status;

  update public.candidates set
    status = p_to_status,
    arrival_at = case when p_to_status = 'arrived' and arrival_at is null then v_now else arrival_at end,
    check_in_at = case when p_to_status = 'id_checked' and check_in_at is null then v_now else check_in_at end,
    id_verified_at = case when p_to_status in ('id_checked','waiting','frisking','biometrics','assigned','lab_entry','testing','completed','signed_out') and id_verified_at is null then v_now else id_verified_at end,
    locker_key = coalesce(p_locker_key, locker_key),
    frisked_at = case when p_to_status = 'frisking' and frisked_at is null then v_now else frisked_at end,
    biometrics_at = case when p_to_status = 'biometrics' and biometrics_at is null then v_now else biometrics_at end,
    workstation_id = coalesce(p_workstation_id, workstation_id),
    lab_entry_at = case when p_to_status = 'lab_entry' and lab_entry_at is null then v_now else lab_entry_at end,
    testing_started_at = case when p_to_status = 'testing' and testing_started_at is null then v_now else testing_started_at end,
    completed_at = case when p_to_status = 'completed' and completed_at is null then v_now else completed_at end,
    signed_out_at = case when p_to_status = 'signed_out' and signed_out_at is null then v_now else signed_out_at end
  where id = p_candidate_id
  returning * into v_candidate;

  insert into public.candidate_events(candidate_id, from_status, to_status, event_type, operator_id, note, metadata_json)
  values (p_candidate_id, v_from, p_to_status, 'candidate.status_changed', auth.uid(), p_note, jsonb_build_object('locker_key', p_locker_key, 'workstation_id', p_workstation_id));
  return v_candidate;
end;
$$;

alter table public.public_display_calls enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_events enable row level security;
alter table public.profiles enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.workstations enable row level security;
alter table public.schedule_rules enable row level security;

create policy display_public_read on public.public_display_calls for select using (active = true);
create policy staff_read_candidates on public.candidates for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.center_id = (select center_id from public.exam_sessions where id = exam_session_id)));
create policy staff_read_events on public.candidate_events for select to authenticated using (exists (select 1 from public.profiles p join public.candidates c on c.id = candidate_id join public.exam_sessions e on e.id = c.exam_session_id where p.id = auth.uid() and p.center_id = e.center_id));
create policy staff_read_workstations on public.workstations for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.center_id = center_id));
create policy staff_read_sessions on public.exam_sessions for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.center_id = center_id));
create policy staff_read_rules on public.schedule_rules for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.center_id = center_id));

create policy staff_insert_display_calls on public.public_display_calls for insert to authenticated with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.center_id = center_id and p.role in ('admin','front_office','lab_staff')));

alter publication supabase_realtime add table public.candidates;
alter publication supabase_realtime add table public.candidate_events;
alter publication supabase_realtime add table public.public_display_calls;

grant execute on function public.transition_candidate(uuid, public.candidate_stage, text, text, uuid) to authenticated;

grant select on public.public_display_calls to anon, authenticated;
grant select on public.candidates, public.candidate_events, public.workstations, public.exam_sessions, public.schedule_rules to authenticated;
grant insert, update on public.schedule_rules to authenticated;
grant insert on public.public_display_calls to authenticated;

insert into public.centers (site_code, name) values ('4960', 'Calicut') on conflict (site_code) do nothing;
