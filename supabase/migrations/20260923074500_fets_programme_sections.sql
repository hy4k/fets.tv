-- An exam is not one block of time.
--
-- CELPIP is Listening, then Reading, then Writing, then Speaking. The centre
-- knows roughly how long each part should take, and that plan is what the board
-- is told. What the board actually asks about afterwards is the other thing:
-- when each part really started, and why the gap.
--
-- So there are two records here, deliberately apart. programme_sections is the
-- plan -- edit it whenever the exam changes. candidate_sections is what was
-- observed, and it copies the name and the estimate at the moment it is
-- written, so editing the plan next month cannot rewrite last month's day.

/**
 * The plan, per exam. Positions are 1..n in the order they are sat.
 *
 * `kind` separates the parts that are scored from the tutorial screens at the
 * front and any break the exam itself schedules, because a delay in a tutorial
 * is a different sentence in the report from a delay in Writing.
 */
create table if not exists public.programme_sections (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.exam_programmes(id) on delete cascade,
  position integer not null check (position > 0 and position <= 40),
  name text not null check (btrim(name) <> '' and length(name) <= 60),
  minutes integer not null check (minutes > 0 and minutes <= 600),
  kind text not null default 'section' check (kind in ('section', 'tutorial', 'break')),
  created_at timestamptz not null default now(),
  constraint programme_sections_in_order unique (programme_id, position)
);

create index if not exists programme_sections_programme_idx
  on public.programme_sections (programme_id, position);

alter table public.programme_sections enable row level security;

drop policy if exists programme_sections_read on public.programme_sections;
create policy programme_sections_read on public.programme_sections
  for select to authenticated
  using (programme_id in (
    select id from public.exam_programmes
     where center_id = (select center_id from public.profiles where id = auth.uid())));

revoke all on public.programme_sections from public, anon, authenticated;
grant select on public.programme_sections to authenticated;

/**
 * What was observed, per candidate.
 *
 * A row appears only when somebody confirms a part has begun. The name and the
 * estimate are copied in at that moment: this table is a record of a day, and
 * a record that changes when a setting is edited is not a record.
 *
 * The last part has no `ended_at` of its own -- the exam finishing is its end,
 * and asking staff to press a second button for the same fact is how the second
 * button stops being pressed.
 */
create table if not exists public.candidate_sections (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  center_id uuid not null references public.centers(id) on delete cascade,
  programme_section_id uuid references public.programme_sections(id) on delete set null,

  position integer not null check (position > 0),
  name text not null,
  minutes integer not null,
  kind text not null default 'section',

  started_at timestamptz not null,
  ended_at timestamptz,
  note text check (note is null or length(note) <= 500),
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  constraint candidate_sections_once unique (candidate_id, position),
  constraint candidate_sections_in_order check (ended_at is null or ended_at >= started_at)
);

create index if not exists candidate_sections_candidate_idx
  on public.candidate_sections (candidate_id, position);
create index if not exists candidate_sections_center_idx
  on public.candidate_sections (center_id, started_at desc);

alter table public.candidate_sections enable row level security;

drop policy if exists candidate_sections_read on public.candidate_sections;
create policy candidate_sections_read on public.candidate_sections
  for select to authenticated
  using (center_id = (select center_id from public.profiles where id = auth.uid()));

revoke all on public.candidate_sections from public, anon, authenticated;
grant select on public.candidate_sections to authenticated;

/**
 * Sets the whole plan for one exam at once.
 *
 * Replace rather than patch: the list is short, it is edited as a list, and a
 * position-by-position diff would be more code than the thing is worth. Rows
 * already observed keep their own copy of the name, so replacing the plan never
 * touches a day that has happened.
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

/**
 * Says that a candidate has reached a part, and when.
 *
 * `p_at` is allowed to be in the past, because the honest answer is usually
 * remembered a few minutes late -- "Writing actually started at 10:42" is worth
 * more than a timestamp of when somebody got to a keyboard. The part before it
 * closes at the same instant, so the two never overlap or leave a gap.
 */
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
    (candidate_id, center_id, programme_section_id, position, name, minutes, kind,
     started_at, note, recorded_by)
  values (c.id, c.center_id, ps.id, ps.position, ps.name, ps.minutes, ps.kind,
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

/** Undoes a confirmation typed against the wrong person or the wrong part. */
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

  -- The part before it is open again: its end was this one's start.
  update public.candidate_sections
     set ended_at = null
   where candidate_id = c.id and ended_at = cs.started_at and position < p_position;

  perform public.fets_log_event(
    c.id, c.center_id, 'section.cleared', c.status, c.status,
    format('%s unconfirmed', cs.name),
    jsonb_build_object('position', cs.position, 'name', cs.name)
  );
end;
$fn$;

revoke all on function
  public.fets_set_programme_sections(uuid, jsonb),
  public.fets_confirm_section(uuid, integer, timestamptz, text),
  public.fets_clear_section(uuid, integer)
  from public, anon, authenticated;

grant execute on function
  public.fets_set_programme_sections(uuid, jsonb),
  public.fets_confirm_section(uuid, integer, timestamptz, text),
  public.fets_clear_section(uuid, integer)
  to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public'
                      and tablename = 'candidate_sections') then
      alter publication supabase_realtime add table public.candidate_sections;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public'
                      and tablename = 'programme_sections') then
      alter publication supabase_realtime add table public.programme_sections;
    end if;
  end if;
end
$$;
