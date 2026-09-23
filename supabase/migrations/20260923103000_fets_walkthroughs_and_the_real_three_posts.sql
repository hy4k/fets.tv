-- The posts a FETS room actually has, and the walk that has to happen.
--
-- I seeded posts by guessing at the rooms. The centre works differently and
-- said so: three staff, rotating every ninety minutes through three jobs. One
-- is the TCA on the floor, who walks the whole area and back every ten minutes.
-- One watches the CCTV for the full ninety. One is on the front desk. Every
-- ninety minutes they move round.
--
-- So the posts become those three, and the ten-minute walk becomes a thing the
-- console counts down to, records, and reports on. No duties have been served
-- yet, so the seeded guesses go rather than being retired.

alter table public.duty_posts drop constraint if exists duty_posts_kind_check;
alter table public.duty_posts
  add constraint duty_posts_kind_check
  check (kind in ('front', 'admin', 'lab', 'cctv', 'floating'));

-- Nothing has been served on the guessed posts, so there is no history to keep.
delete from public.duty_posts
 where name in ('Admin room', 'Lab 1', 'Lab 2', 'Relief')
   and not exists (select 1 from public.duty_blocks b where b.post_id = duty_posts.id);

insert into public.duty_posts (center_id, name, position, kind)
select c.id, 'Floor', 1, 'lab' from public.centers c
on conflict (center_id, name) do nothing;

insert into public.duty_posts (center_id, name, position, kind)
select c.id, 'CCTV', 2, 'cctv' from public.centers c
on conflict (center_id, name) do nothing;

update public.duty_posts set position = 3, kind = 'front' where name = 'Front desk';

/**
 * A walk of the floor, written down.
 *
 * The board's question afterwards is not "was there a policy" but "when was the
 * hall last walked". One row per walk, carrying the name of whoever did it for
 * the same reason a duty block does.
 */
create table if not exists public.walkthroughs (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  exam_session_id uuid references public.exam_sessions(id) on delete cascade,

  duty_block_id uuid references public.duty_blocks(id) on delete set null,
  post_id uuid references public.duty_posts(id) on delete set null,

  walked_by uuid references public.profiles(id) on delete set null,
  walked_by_name text not null,
  walked_at timestamptz not null default now(),

  /** Anything seen. Empty is the normal answer and is not a gap in the record. */
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists walkthroughs_center_idx
  on public.walkthroughs (center_id, walked_at desc);
create index if not exists walkthroughs_session_idx
  on public.walkthroughs (exam_session_id, walked_at);

alter table public.walkthroughs enable row level security;

drop policy if exists walkthroughs_read on public.walkthroughs;
create policy walkthroughs_read on public.walkthroughs
  for select to authenticated
  using (center_id = (select center_id from public.profiles where id = auth.uid()));

revoke all on public.walkthroughs from public, anon, authenticated;
grant select on public.walkthroughs to authenticated;

-- How often the floor is walked. Ten minutes is what the centre does.
alter table public.schedule_rules
  add column if not exists walkthrough_minutes integer not null default 10;

alter table public.schedule_rules
  drop constraint if exists schedule_rules_walkthrough_minutes_check;
alter table public.schedule_rules
  add constraint schedule_rules_walkthrough_minutes_check
  check (walkthrough_minutes >= 2 and walkthrough_minutes <= 120);

/**
 * Records a walk.
 *
 * Anybody on the floor may record one. It is deliberately not restricted to
 * whoever formally holds the Floor post: a walk that happened and went
 * unrecorded because the console was fussy about the rota is the worst of both
 * answers. Which post they held, if any, is kept alongside.
 */
create or replace function public.fets_record_walkthrough(
  p_center uuid,
  p_note text default null
)
returns public.walkthroughs
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  w public.walkthroughs;
  pf public.profiles;
  db public.duty_blocks;
  v_session uuid;
begin
  perform public.fets_guard(
    p_center, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  select * into pf from public.profiles where id = auth.uid();

  -- Their own open duty, if they are on one. The Floor post is preferred when
  -- somebody is doubled up, since that is the post the walk belongs to.
  select b.* into db
    from public.duty_blocks b
    join public.duty_posts p on p.id = b.post_id
   where b.center_id = p_center
     and b.profile_id = auth.uid()
     and b.ended_at is null
   order by case when p.kind = 'lab' then 0 else 1 end, b.started_at desc
   limit 1;

  select id into v_session from public.exam_sessions
   where center_id = p_center and status in ('draft', 'ready', 'live')
   order by created_at desc limit 1;

  insert into public.walkthroughs
    (center_id, exam_session_id, duty_block_id, post_id, walked_by, walked_by_name, note)
  values (
    p_center, v_session, db.id, db.post_id, auth.uid(),
    coalesce(pf.display_name, 'Unknown'),
    nullif(btrim(coalesce(p_note, '')), ''))
  returning * into w;

  return w;
end;
$fn$;

revoke all on function public.fets_record_walkthrough(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fets_record_walkthrough(uuid, text) to authenticated;

/**
 * The report gains the walks.
 *
 * Not one line per walk -- forty of those tells a board nothing. The gap is the
 * fact: how often the floor was meant to be walked, how many walks there were,
 * the longest they went unwalked, and how many times the interval was missed.
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
  v_walks jsonb;
  v_interval integer;
begin
  select * into s from public.exam_sessions where id = p_session;
  if not found then raise exception 'that day does not exist' using errcode = 'P0002'; end if;

  perform public.fets_guard(s.center_id, array['admin', 'tca']::public.user_role[]);

  select * into ct from public.centers where id = s.center_id;
  select * into r from public.problem_reports where exam_session_id = p_session;

  if r.status = 'final' and r.snapshot is not null then
    return r.snapshot;
  end if;

  select coalesce(walkthrough_minutes, 10) into v_interval
    from public.schedule_rules where center_id = s.center_id;
  v_interval := coalesce(v_interval, 10);

  select jsonb_build_object(
           'rostered', count(*),
           'sat', count(*) filter (where exam_started_at is not null),
           'finished', count(*) filter (where exam_finished_at is not null),
           'signed_out', count(*) filter (where status = 'signed_out'),
           'no_shows', count(*) filter (where status = 'no_show')
         )
    into v_counts
    from public.candidates where exam_session_id = p_session;

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

  with walks as (
    select walked_at,
           lag(walked_at) over (order by walked_at) as prev
      from public.walkthroughs
     where exam_session_id = p_session
  )
  select jsonb_build_object(
           'interval_minutes', v_interval,
           'walks', (select count(*) from walks),
           'longest_gap_minutes',
             coalesce(max(round(extract(epoch from (walked_at - prev)) / 60)::integer), 0),
           'gaps_over_interval',
             count(*) filter (where extract(epoch from (walked_at - prev)) / 60 > v_interval),
           'first_at', (select min(walked_at) from walks),
           'last_at', (select max(walked_at) from walks)
         )
    into v_walks
    from walks
   where prev is not null;

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
    'walks', v_walks,
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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public'
                      and tablename = 'walkthroughs') then
      alter publication supabase_realtime add table public.walkthroughs;
    end if;
  end if;
end
$$;
