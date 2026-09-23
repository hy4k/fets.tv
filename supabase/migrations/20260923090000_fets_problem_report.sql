-- The Center Problem Report, assembled rather than remembered.
--
-- When a day goes wrong the board wants an account of it, and the account is
-- written days later from whatever somebody wrote down at the time. Everything
-- needed is already in this database: the incidents, the machine a candidate
-- was moved off, the scratch sheet that never came back, the section that
-- started twelve minutes late. What was missing was one place that puts them in
-- order and hands the centre a draft.
--
-- The timeline is never typed. It is read out of what happened, so it cannot
-- disagree with the audit trail. What a person adds is the part only a person
-- has: what it meant, what was done, and who it went to.

create table if not exists public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  exam_session_id uuid not null unique references public.exam_sessions(id) on delete cascade,

  summary text check (summary is null or length(summary) <= 4000),
  actions_taken text check (actions_taken is null or length(actions_taken) <= 4000),
  reported_to text check (reported_to is null or length(reported_to) <= 200),

  status text not null default 'draft' check (status in ('draft', 'final')),

  -- What the timeline said when it was signed off. A report that keeps moving
  -- after it has been sent is not a report.
  snapshot jsonb,
  finalised_at timestamptz,
  finalised_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),

  constraint problem_reports_final_is_frozen
    check ((status = 'final') = (finalised_at is not null))
);

create index if not exists problem_reports_center_idx on public.problem_reports (center_id);

alter table public.problem_reports enable row level security;

drop policy if exists problem_reports_read on public.problem_reports;
create policy problem_reports_read on public.problem_reports
  for select to authenticated
  using (center_id = (select center_id from public.profiles where id = auth.uid()));

revoke all on public.problem_reports from public, anon, authenticated;
grant select on public.problem_reports to authenticated;

/**
 * The whole report for one day, assembled on the spot.
 *
 * Returns the frozen snapshot once it has been signed off, and a live reading
 * of the day until then — so a draft keeps up with a day still happening, and a
 * final one cannot drift away from what was sent.
 */
create or replace function public.fets_problem_report(p_session uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  s public.exam_sessions;
  ct public.centers;
  r public.problem_reports;
  v_timeline jsonb;
  v_delays jsonb;
  v_counts jsonb;
begin
  select * into s from public.exam_sessions where id = p_session;
  if not found then raise exception 'that day does not exist' using errcode = 'P0002'; end if;

  perform public.fets_guard(s.center_id, array['admin', 'tca']::public.user_role[]);

  select * into ct from public.centers where id = s.center_id;
  select * into r from public.problem_reports where exam_session_id = p_session;

  if r.status = 'final' and r.snapshot is not null then
    return r.snapshot;
  end if;

  select jsonb_build_object(
           'rostered', count(*),
           'sat', count(*) filter (where exam_started_at is not null),
           'finished', count(*) filter (where exam_finished_at is not null),
           'signed_out', count(*) filter (where status = 'signed_out'),
           'no_shows', count(*) filter (where status = 'no_show')
         )
    into v_counts
    from public.candidates where exam_session_id = p_session;

  -- Everything that happened, in the order it happened. Incidents are the
  -- backbone; the two event kinds below it are the exceptions a person made by
  -- hand, which a board asks about precisely because they were deliberate.
  select coalesce(jsonb_agg(x order by at), '[]'::jsonb)
    into v_timeline
    from (
      select i.started_at as at,
             jsonb_build_object(
               'at', i.started_at,
               'kind', 'incident',
               'category', i.kind,
               'severity', i.severity,
               'title', i.summary,
               'detail', i.detail,
               'token', c.public_token,
               'seat', w.seat_code,
               'minutes_lost', i.minutes_lost,
               'resolved_at', i.resolved_at,
               'resolution', i.resolution,
               'reportable', i.reportable
             ) as x
        from public.incidents i
        left join public.candidates c on c.id = i.candidate_id
        left join public.workstations w on w.id = i.workstation_id
       where i.exam_session_id = p_session

      union all

      select e.occurred_at as at,
             jsonb_build_object(
               'at', e.occurred_at,
               'kind', case when e.event_type = 'admin.override' then 'override' else 'correction' end,
               'category', e.event_type,
               'severity', 'minor',
               'title', case
                          when e.event_type = 'admin.override'
                            then format('%s moved to %s by hand', c.public_token, e.to_status)
                          else format('%s clock corrected', c.public_token)
                        end,
               'detail', e.note,
               'token', c.public_token,
               'seat', null,
               'minutes_lost', null,
               'resolved_at', null,
               'resolution', null,
               'reportable', true
             ) as x
        from public.candidate_events e
        join public.candidates c on c.id = e.candidate_id
       where c.exam_session_id = p_session
         and e.event_type in ('admin.override', 'exam.time_corrected')
    ) t;

  -- Section delays, gathered by part rather than by candidate. "Writing started
  -- late for four of them" is the sentence the board wants; thirty lines saying
  -- the same thing is not.
  select coalesce(jsonb_agg(d order by d->>'name'), '[]'::jsonb)
    into v_delays
    from (
      select jsonb_build_object(
               'name', drift.name,
               'candidates', count(*),
               'worst_minutes', max(drift.minutes),
               'median_minutes', round(percentile_cont(0.5) within group (order by drift.minutes))::integer
             ) as d
        from (
          select cs.name,
                 round(extract(epoch from (
                   cs.started_at - (c.exam_started_at + make_interval(mins => coalesce((
                     select sum(coalesce(cs2.minutes, ps2.minutes))::integer
                       from public.programme_sections ps2
                       left join public.candidate_sections cs2
                         on cs2.candidate_id = cs.candidate_id and cs2.position = ps2.position
                      where ps2.programme_id = c.programme_id and ps2.position < cs.position
                   ), 0)))
                 )) / 60)::integer as minutes
            from public.candidate_sections cs
            join public.candidates c on c.id = cs.candidate_id
           where cs.exam_session_id = p_session
             and c.exam_started_at is not null
             and c.programme_id is not null
        ) drift
       where drift.minutes >= 5
       group by drift.name
    ) x;

  return jsonb_build_object(
    'generated_at', now(),
    'live', true,
    'session', jsonb_build_object(
      'id', s.id,
      'exam_name', s.exam_name,
      'exam_date', s.exam_date,
      'status', s.status
    ),
    'center', jsonb_build_object('name', ct.name, 'code', ct.site_code, 'timezone', ct.timezone),
    'counts', v_counts,
    'timeline', v_timeline,
    'delays', v_delays,
    'narrative', jsonb_build_object(
      'summary', r.summary,
      'actions_taken', r.actions_taken,
      'reported_to', r.reported_to,
      'status', coalesce(r.status, 'draft'),
      'finalised_at', r.finalised_at
    )
  );
end;
$fn$;

/** Keeps the part only a person can write. Refused once it has been signed off. */
create or replace function public.fets_save_problem_report(
  p_session uuid,
  p_summary text default null,
  p_actions text default null,
  p_reported_to text default null
)
returns public.problem_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s public.exam_sessions;
  r public.problem_reports;
begin
  select * into s from public.exam_sessions where id = p_session;
  if not found then raise exception 'that day does not exist' using errcode = 'P0002'; end if;

  perform public.fets_guard(s.center_id, array['admin', 'tca']::public.user_role[]);

  select * into r from public.problem_reports where exam_session_id = p_session;
  if r.status = 'final' then
    raise exception 'that report has been signed off; reopen it first' using errcode = 'P0001';
  end if;

  insert into public.problem_reports
    (center_id, exam_session_id, summary, actions_taken, reported_to, updated_by)
  values (
    s.center_id, p_session,
    nullif(btrim(coalesce(p_summary, '')), ''),
    nullif(btrim(coalesce(p_actions, '')), ''),
    nullif(btrim(coalesce(p_reported_to, '')), ''),
    auth.uid())
  on conflict (exam_session_id) do update
     set summary = excluded.summary,
         actions_taken = excluded.actions_taken,
         reported_to = excluded.reported_to,
         updated_at = now(),
         updated_by = auth.uid()
  returning * into r;

  return r;
end;
$fn$;

/**
 * Signs the report off, freezing the timeline as it stands.
 *
 * Refused while anything is still open: an incident nobody closed is either
 * unresolved, in which case the day is not over, or forgotten, in which case
 * the report would be wrong in the way that matters most.
 */
create or replace function public.fets_finalise_problem_report(p_session uuid)
returns public.problem_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s public.exam_sessions;
  r public.problem_reports;
  v_open integer;
  v_snapshot jsonb;
begin
  select * into s from public.exam_sessions where id = p_session;
  if not found then raise exception 'that day does not exist' using errcode = 'P0002'; end if;

  perform public.fets_guard(s.center_id, array['admin', 'tca']::public.user_role[]);

  select * into r from public.problem_reports where exam_session_id = p_session;
  if r.status = 'final' then
    raise exception 'that report is already signed off' using errcode = 'P0001';
  end if;

  if r.summary is null then
    raise exception 'write what happened before signing it off' using errcode = 'P0001';
  end if;

  select count(*) into v_open
    from public.incidents
   where exam_session_id = p_session and resolved_at is null;

  if v_open > 0 then
    raise exception '% incident(s) are still open; close them first', v_open using errcode = 'P0001';
  end if;

  v_snapshot := public.fets_problem_report(p_session);
  v_snapshot := jsonb_set(v_snapshot, '{live}', 'false'::jsonb);

  update public.problem_reports
     set status = 'final',
         snapshot = jsonb_set(v_snapshot, '{narrative,status}', '"final"'::jsonb),
         finalised_at = now(),
         finalised_by = auth.uid(),
         updated_at = now(),
         updated_by = auth.uid()
   where exam_session_id = p_session
  returning * into r;

  return r;
end;
$fn$;

/** Reopens a signed-off report. Admins only: it has usually been sent by then. */
create or replace function public.fets_reopen_problem_report(p_session uuid)
returns public.problem_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s public.exam_sessions;
  r public.problem_reports;
begin
  select * into s from public.exam_sessions where id = p_session;
  if not found then raise exception 'that day does not exist' using errcode = 'P0002'; end if;

  perform public.fets_guard(s.center_id, array['admin']::public.user_role[]);

  update public.problem_reports
     set status = 'draft',
         finalised_at = null,
         finalised_by = null,
         updated_at = now(),
         updated_by = auth.uid()
   where exam_session_id = p_session and status = 'final'
  returning * into r;

  if r.id is null then
    raise exception 'there is no signed-off report for that day' using errcode = 'P0002';
  end if;

  -- The snapshot stays. It is what was sent, and deleting it would lose the
  -- only copy of the version the board actually received.
  return r;
end;
$fn$;

revoke all on function
  public.fets_problem_report(uuid),
  public.fets_save_problem_report(uuid, text, text, text),
  public.fets_finalise_problem_report(uuid),
  public.fets_reopen_problem_report(uuid)
  from public, anon, authenticated;

grant execute on function
  public.fets_problem_report(uuid),
  public.fets_save_problem_report(uuid, text, text, text),
  public.fets_finalise_problem_report(uuid),
  public.fets_reopen_problem_report(uuid)
  to authenticated;
