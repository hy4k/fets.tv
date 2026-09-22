-- Things that go wrong, written down while they are happening.
--
-- A centre reports problems to the board afterwards, and the report is only as
-- good as what somebody remembered to note at the time. This is that note: what
-- happened, when it started, who and what it touched, and when it was resolved.
-- The Center Problem Report is assembled from these rather than from memory.

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  exam_session_id uuid references public.exam_sessions(id) on delete cascade,

  kind text not null check (kind in (
    'workstation',   -- a machine froze, crashed, lost power
    'network',       -- the connection dropped
    'power',         -- the building, a UPS
    'candidate',     -- illness, distress, a dispute
    'conduct',       -- suspected misconduct
    'environment',   -- noise, heat, a fire alarm
    'delivery',      -- the exam software itself
    'other'
  )),
  severity text not null default 'minor' check (severity in ('minor', 'major', 'critical')),

  summary text not null check (btrim(summary) <> '' and length(summary) <= 200),
  detail text check (detail is null or length(detail) <= 4000),

  -- What it touched. Both optional: a fire alarm touches neither, a frozen
  -- machine touches both.
  candidate_id uuid references public.candidates(id) on delete set null,
  workstation_id uuid references public.workstations(id) on delete set null,

  -- When it actually began, which is rarely when somebody got to a keyboard.
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution is null or length(resolution) <= 2000),

  -- Time the candidate lost, as judged by the person who was there. The clock
  -- cannot work this out: it keeps running through a freeze.
  minutes_lost integer check (minutes_lost is null or (minutes_lost >= 0 and minutes_lost <= 1440)),

  -- Whether this one has to be reported to the board.
  reportable boolean not null default false,

  logged_by uuid references auth.users(id),
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  constraint incidents_resolved_together
    check ((resolved_at is null) = (resolution is null))
);

create index if not exists incidents_center_started_idx
  on public.incidents (center_id, started_at desc);
create index if not exists incidents_session_idx on public.incidents (exam_session_id);
create index if not exists incidents_open_idx
  on public.incidents (center_id) where resolved_at is null;

alter table public.incidents enable row level security;

drop policy if exists incidents_read on public.incidents;
create policy incidents_read on public.incidents
  for select to authenticated
  using (center_id = (select center_id from public.profiles where id = auth.uid()));

revoke all on public.incidents from public, anon, authenticated;
grant select on public.incidents to authenticated;

/**
 * Writes down something that has gone wrong.
 *
 * Anybody on the floor may log one: the person who saw it is the person who
 * should write it, and making them find an admin first is how detail gets lost.
 */
create or replace function public.fets_log_incident(
  p_center uuid,
  p_kind text,
  p_summary text,
  p_severity text default 'minor',
  p_detail text default null,
  p_candidate uuid default null,
  p_workstation uuid default null,
  p_started_at timestamptz default null,
  p_reportable boolean default false
)
returns public.incidents
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  i public.incidents;
  v_session uuid;
  v_summary text := btrim(coalesce(p_summary, ''));
  v_started timestamptz := coalesce(p_started_at, now());
begin
  perform public.fets_guard(
    p_center, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  if v_summary = '' then
    raise exception 'say in one line what happened' using errcode = 'P0001';
  end if;

  if v_started > now() + interval '5 minutes' then
    raise exception 'an incident cannot start in the future' using errcode = 'P0001';
  end if;

  if p_candidate is not null
     and not exists (select 1 from public.candidates where id = p_candidate and center_id = p_center) then
    raise exception 'that candidate is not at this center' using errcode = 'P0002';
  end if;

  if p_workstation is not null
     and not exists (select 1 from public.workstations where id = p_workstation and center_id = p_center) then
    raise exception 'that workstation is not at this center' using errcode = 'P0002';
  end if;

  select id into v_session from public.exam_sessions
   where center_id = p_center and status in ('draft', 'ready', 'live')
   order by created_at desc limit 1;

  insert into public.incidents
    (center_id, exam_session_id, kind, severity, summary, detail,
     candidate_id, workstation_id, started_at, reportable, logged_by)
  values (
    p_center, v_session, p_kind, p_severity, v_summary,
    nullif(btrim(coalesce(p_detail, '')), ''),
    p_candidate, p_workstation, v_started, coalesce(p_reportable, false), auth.uid()
  )
  returning * into i;

  -- An incident about one candidate belongs on that candidate's own timeline
  -- too, so the audit trail reads as one story rather than two.
  if p_candidate is not null then
    perform public.fets_log_event(
      p_candidate, p_center, 'incident.logged',
      (select status from public.candidates where id = p_candidate),
      (select status from public.candidates where id = p_candidate),
      v_summary,
      jsonb_build_object('incident_id', i.id, 'kind', p_kind, 'severity', p_severity)
    );
  end if;

  return i;
end;
$fn$;

/** Closes an incident: what was done about it, and what it cost the candidate. */
create or replace function public.fets_resolve_incident(
  p_incident uuid,
  p_resolution text,
  p_minutes_lost integer default null
)
returns public.incidents
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  i public.incidents;
  v_resolution text := btrim(coalesce(p_resolution, ''));
begin
  select * into i from public.incidents where id = p_incident for update;
  if not found then raise exception 'that incident does not exist' using errcode = 'P0002'; end if;

  perform public.fets_guard(
    i.center_id, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  if v_resolution = '' then
    raise exception 'say what was done about it' using errcode = 'P0001';
  end if;

  if i.resolved_at is not null then
    raise exception 'that incident is already closed' using errcode = 'P0001';
  end if;

  update public.incidents
     set resolved_at = now(),
         resolution = v_resolution,
         minutes_lost = p_minutes_lost,
         resolved_by = auth.uid()
   where id = p_incident
  returning * into i;

  if i.candidate_id is not null then
    perform public.fets_log_event(
      i.candidate_id, i.center_id, 'incident.resolved',
      (select status from public.candidates where id = i.candidate_id),
      (select status from public.candidates where id = i.candidate_id),
      v_resolution,
      jsonb_build_object('incident_id', i.id, 'minutes_lost', p_minutes_lost)
    );
  end if;

  return i;
end;
$fn$;

/** Corrects an open incident. A closed one is a record, so it stays as it is. */
create or replace function public.fets_update_incident(
  p_incident uuid,
  p_summary text default null,
  p_detail text default null,
  p_severity text default null,
  p_reportable boolean default null
)
returns public.incidents
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  i public.incidents;
begin
  select * into i from public.incidents where id = p_incident for update;
  if not found then raise exception 'that incident does not exist' using errcode = 'P0002'; end if;

  perform public.fets_guard(
    i.center_id, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  if i.resolved_at is not null then
    raise exception 'that incident is closed; it cannot be changed' using errcode = 'P0001';
  end if;

  if p_summary is not null and btrim(p_summary) = '' then
    raise exception 'say in one line what happened' using errcode = 'P0001';
  end if;

  update public.incidents
     set summary    = coalesce(nullif(btrim(coalesce(p_summary, '')), ''), summary),
         detail     = case when p_detail is null then detail
                           else nullif(btrim(p_detail), '') end,
         severity   = coalesce(p_severity, severity),
         reportable = coalesce(p_reportable, reportable)
   where id = p_incident
  returning * into i;

  return i;
end;
$fn$;

revoke all on function
  public.fets_log_incident(uuid, text, text, text, text, uuid, uuid, timestamptz, boolean),
  public.fets_resolve_incident(uuid, text, integer),
  public.fets_update_incident(uuid, text, text, text, boolean)
  from public, anon, authenticated;

grant execute on function
  public.fets_log_incident(uuid, text, text, text, text, uuid, uuid, timestamptz, boolean),
  public.fets_resolve_incident(uuid, text, integer),
  public.fets_update_incident(uuid, text, text, text, boolean)
  to authenticated;
