-- Two ways the report could lie about a day.
--
-- The delay figures were driven by the exam's current plan. Observations keep
-- their own copy of the name and length precisely so a later edit cannot rewrite
-- them, but the expected start of each part was still summed from
-- programme_sections -- so removing a part months later shortened the run-up for
-- every day already sat, and every later part in those reports started reading
-- as late by exactly that part's length. The sum now walks the positions either
-- side knows about and prefers the candidate's own copy, which is the same rule
-- the console uses on screen.
--
-- And the frozen snapshot was built a moment before finalised_at was written, so
-- every signed-off report said it was signed off at no time at all: the page and
-- the copied text both rendered "Signed off —". The timestamp is settled first
-- now and the same value goes into the row and the snapshot.

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
  --
  -- The run-up to a part is summed over every position either the plan or the
  -- candidate's own record knows about, preferring the copy that was taken at
  -- the time. A part deleted from the plan afterwards still counts towards the
  -- day it was actually sat.
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
                       from (
                         select position from public.candidate_sections
                          where candidate_id = cs.candidate_id
                         union
                         select position from public.programme_sections
                          where programme_id = c.programme_id
                       ) pos
                       left join public.candidate_sections cs2
                         on cs2.candidate_id = cs.candidate_id and cs2.position = pos.position
                       left join public.programme_sections ps2
                         on ps2.programme_id = c.programme_id and ps2.position = pos.position
                      where pos.position < cs.position
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

/**
 * Signs the report off, freezing the timeline as it stands.
 *
 * The moment of signing is settled before the snapshot is taken, so the copy
 * that is served afterwards carries the same timestamp as the row.
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
  v_now timestamptz := now();
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
  v_snapshot := jsonb_set(v_snapshot, '{narrative,status}', '"final"'::jsonb);
  v_snapshot := jsonb_set(v_snapshot, '{narrative,finalised_at}', to_jsonb(v_now));

  update public.problem_reports
     set status = 'final',
         snapshot = v_snapshot,
         finalised_at = v_now,
         finalised_by = auth.uid(),
         updated_at = v_now,
         updated_by = auth.uid()
   where exam_session_id = p_session
  returning * into r;

  return r;
end;
$fn$;
