-- The parts of an exam are a chain: each one ends where the next begins. Two
-- ways of editing that chain broke it.
--
-- Backfilling a part that was missed -- the out-of-order case the confirm was
-- written to allow -- inserted it with no end, even though the part after it
-- already had a start to hand. And undoing a part in the middle reopened the
-- one before it, leaving two parts open at once with the duration of neither
-- recorded. Both lose exactly the fact the Center Problem Report is for.
--
-- The rule in both places is the same: a part ends at the next confirmed
-- start, and only the last one is open.
--
-- Editing the plan under a candidate who is sitting it is refused now too.
-- Observations are matched to the plan by position, so reordering the parts
-- mid-exam would pair a part with somebody else's observation.

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
  v_next_start timestamptz;
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

  -- Confirming out of order is allowed -- staff catch up on a part they
  -- missed -- but the times still have to line up, so a confirmation cannot be
  -- placed after a part that already began.
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

  -- And this one ends where the next confirmed part begins, which matters when
  -- the next part was confirmed first and this one is being filled in behind
  -- it. Null when it is the last: the exam finishing is its end.
  select min(started_at) into v_next_start
    from public.candidate_sections
   where candidate_id = c.id and position > p_position;

  insert into public.candidate_sections
    (candidate_id, center_id, exam_session_id, programme_section_id, position, name, minutes,
     kind, started_at, ended_at, note, recorded_by)
  values (c.id, c.center_id, c.exam_session_id, ps.id, ps.position, ps.name, ps.minutes, ps.kind,
          v_at, v_next_start, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (candidate_id, position) do update
     set started_at = excluded.started_at,
         ended_at = excluded.ended_at,
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

/**
 * Undoes a confirmation typed against the wrong person or the wrong part.
 *
 * The part before it does not simply reopen: if a later part is still
 * confirmed, that later start is now the predecessor's end. Only removing the
 * last confirmation leaves anything open.
 */
create or replace function public.fets_clear_section(
  p_candidate uuid,
  p_position integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  cs public.candidate_sections;
  v_next_start timestamptz;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(
    c.center_id, array['admin', 'tca', 'lab_staff']::public.user_role[]);

  delete from public.candidate_sections
   where candidate_id = c.id and position = p_position
  returning * into cs;

  if cs.id is null then
    raise exception 'that part was never confirmed' using errcode = 'P0002';
  end if;

  select min(started_at) into v_next_start
    from public.candidate_sections
   where candidate_id = c.id and position > p_position;

  update public.candidate_sections
     set ended_at = v_next_start
   where id = (select id from public.candidate_sections
                where candidate_id = c.id and position < p_position
                order by position desc limit 1);

  perform public.fets_log_event(
    c.id, c.center_id, 'section.cleared', c.status, c.status,
    format('%s unconfirmed', cs.name),
    jsonb_build_object('position', cs.position, 'name', cs.name)
  );
end;
$fn$;

/**
 * Sets the whole plan for one exam at once.
 *
 * Now refused while somebody is sitting that exam. An observation is matched
 * to the plan by position, so reordering the parts under a candidate would
 * pair a part with an observation of a different one -- and the day in
 * progress is the one day nobody can go back and check.
 */
create or replace function public.fets_set_programme_sections(
  p_programme uuid,
  p_sections jsonb
)
returns setof public.programme_sections
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pr public.exam_programmes;
  v_item jsonb;
  v_pos integer := 0;
  v_name text;
  v_minutes integer;
  v_kind text;
  v_sitting integer;
begin
  select * into pr from public.exam_programmes where id = p_programme;
  if not found then raise exception 'no such exam' using errcode = 'P0002'; end if;

  perform public.fets_guard(pr.center_id, array['admin']::public.user_role[]);

  if jsonb_typeof(coalesce(p_sections, 'null'::jsonb)) <> 'array' then
    raise exception 'give the parts as a list' using errcode = 'P0001';
  end if;

  if jsonb_array_length(p_sections) > 40 then
    raise exception 'forty parts is more than any exam has' using errcode = 'P0001';
  end if;

  select count(*) into v_sitting
    from public.candidates
   where programme_id = p_programme
     and exam_started_at is not null
     and exam_finished_at is null;

  if v_sitting > 0 then
    raise exception
      '% candidate(s) are sitting this exam now; change its parts once they have finished', v_sitting
      using errcode = 'P0001';
  end if;

  delete from public.programme_sections where programme_id = p_programme;

  for v_item in select * from jsonb_array_elements(p_sections) loop
    v_pos := v_pos + 1;
    v_name := btrim(coalesce(v_item->>'name', ''));
    v_minutes := coalesce((v_item->>'minutes')::integer, 0);
    v_kind := coalesce(nullif(btrim(coalesce(v_item->>'kind', '')), ''), 'section');

    if v_name = '' then
      raise exception 'part % has no name', v_pos using errcode = 'P0001';
    end if;

    if v_minutes < 1 or v_minutes > 600 then
      raise exception 'give % a length between 1 and 600 minutes', v_name using errcode = 'P0001';
    end if;

    insert into public.programme_sections (programme_id, position, name, minutes, kind)
    values (p_programme, v_pos, v_name, v_minutes, v_kind);
  end loop;

  return query
    select * from public.programme_sections
     where programme_id = p_programme order by position;
end;
$fn$;
