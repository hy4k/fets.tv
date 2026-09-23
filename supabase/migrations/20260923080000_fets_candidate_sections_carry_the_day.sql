-- candidate_sections could only be fetched by centre, which means every part of
-- every day ever sat. The console wants today's, the Center Problem Report
-- wants one day's, and both are the same question: which session was this.
--
-- candidate_materials already carries it; this is the same column for the same
-- reason.

alter table public.candidate_sections
  add column if not exists exam_session_id uuid references public.exam_sessions(id) on delete cascade;

update public.candidate_sections cs
   set exam_session_id = c.exam_session_id
  from public.candidates c
 where c.id = cs.candidate_id and cs.exam_session_id is null;

create index if not exists candidate_sections_session_idx
  on public.candidate_sections (exam_session_id, position);

create or replace function public.fets_confirm_section(
  p_candidate uuid,
  p_position integer,
  p_at timestamptz default null,
  p_note text default null
)
returns public.candidate_sections
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  ps public.programme_sections;
  cs public.candidate_sections;
  v_at timestamptz := coalesce(p_at, now());
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(
    c.center_id, array['admin', 'tca', 'lab_staff']::public.user_role[]);

  if c.exam_started_at is null then
    raise exception 'their exam has not started' using errcode = 'P0001';
  end if;

  if c.programme_id is null then
    raise exception 'this candidate has no exam set, so it has no parts'
      using errcode = 'P0001';
  end if;

  select * into ps from public.programme_sections
   where programme_id = c.programme_id and position = p_position;
  if not found then
    raise exception 'that exam has no part %', p_position using errcode = 'P0002';
  end if;

  if v_at < c.exam_started_at then
    raise exception 'a part cannot start before the exam did' using errcode = 'P0001';
  end if;

  if v_at > now() + interval '5 minutes' then
    raise exception 'a part cannot start in the future' using errcode = 'P0001';
  end if;

  -- Confirming out of order is allowed -- staff catch up on a part they missed
  -- -- but the times still have to line up, so a confirmation cannot be placed
  -- after a part that already began.
  if exists (select 1 from public.candidate_sections
              where candidate_id = c.id and position > p_position and started_at < v_at) then
    raise exception 'a later part already began before that time' using errcode = 'P0001';
  end if;

  -- Whatever was open before this one ends here.
  update public.candidate_sections
     set ended_at = v_at
   where id = (select id from public.candidate_sections
                where candidate_id = c.id and position < p_position and started_at <= v_at
                order by position desc limit 1);

  insert into public.candidate_sections
    (candidate_id, center_id, exam_session_id, programme_section_id, position, name, minutes,
     kind, started_at, note, recorded_by)
  values (c.id, c.center_id, c.exam_session_id, ps.id, ps.position, ps.name, ps.minutes, ps.kind,
          v_at, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (candidate_id, position) do update
     set started_at = excluded.started_at,
         note = coalesce(excluded.note, candidate_sections.note),
         recorded_by = auth.uid()
  returning * into cs;

  perform public.fets_log_event(
    c.id, c.center_id, 'section.confirmed', c.status, c.status,
    format('%s started', ps.name),
    jsonb_build_object('position', ps.position, 'name', ps.name,
                       'at', v_at, 'estimate_minutes', ps.minutes)
  );

  return cs;
end;
$fn$;
