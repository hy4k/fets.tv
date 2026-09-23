-- What the centre hands out, and getting it back.
--
-- Scratch sheets, pencils and water go in with the candidate. The sheets in
-- particular have to come out again: a used sheet leaving the building is an
-- exam-security matter, not a stationery one. So the count is kept per person,
-- and a candidate cannot be signed out while anything returnable is still in
-- their hands. If something genuinely cannot be recovered it is written off,
-- with a reason, and that writes its own reportable incident.

/**
 * The catalogue. Global rather than per-centre: every FETS room hands out the
 * same short list, and the Setup page can retire one by clearing `active`
 * without touching what has already been issued.
 *
 * `returnable` is the whole point of the table. Water is consumed; a pencil is
 * not. Only returnable things hold a sign-out up.
 */
create table if not exists public.material_kinds (
  code text primary key,
  label text not null,
  returnable boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.material_kinds (code, label, returnable, sort_order) values
  ('scratch_sheet', 'Scratch sheet', true,  10),
  ('pencil',        'Pencil',        true,  20),
  ('headset',       'Headset',       true,  30),
  ('whiteboard',    'Whiteboard',    true,  40),
  ('water',         'Water',         false, 50),
  ('earplugs',      'Earplugs',      false, 60),
  ('other',         'Other',         true,  90)
on conflict (code) do nothing;

alter table public.material_kinds enable row level security;

drop policy if exists material_kinds_read on public.material_kinds;
create policy material_kinds_read on public.material_kinds
  for select to authenticated using (true);

revoke all on public.material_kinds from public, anon, authenticated;
grant select on public.material_kinds to authenticated;

/**
 * One row per candidate per thing, counted rather than one row per sheet.
 *
 * `label` is only for 'other' -- an empty string, not null, so the uniqueness
 * of "this candidate's pencils" is a plain constraint the database can enforce
 * and the issue call can upsert onto.
 */
create table if not exists public.candidate_materials (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  exam_session_id uuid references public.exam_sessions(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,

  kind text not null references public.material_kinds(code),
  label text not null default '' check (length(label) <= 60),

  issued_count integer not null check (issued_count > 0 and issued_count <= 99),
  returned_count integer not null default 0 check (returned_count >= 0),

  -- Written off: it is not coming back. Kept apart from returned so the day's
  -- reckoning can tell "all accounted for" from "one sheet is missing".
  written_off_count integer not null default 0 check (written_off_count >= 0),
  written_off_at timestamptz,
  written_off_reason text check (written_off_reason is null or length(written_off_reason) <= 500),

  first_issued_at timestamptz not null default now(),
  last_issued_at timestamptz not null default now(),
  issued_by uuid references auth.users(id),
  returned_at timestamptz,
  returned_by uuid references auth.users(id),

  constraint candidate_materials_one_row unique (candidate_id, kind, label),
  constraint materials_accounted_for check (returned_count + written_off_count <= issued_count),
  constraint materials_returned_has_time check (returned_count = 0 or returned_at is not null),
  constraint materials_write_off_together
    check ((written_off_at is null) = (written_off_reason is null)),
  constraint materials_write_off_counted
    check ((written_off_at is null) = (written_off_count = 0))
);

create index if not exists candidate_materials_candidate_idx
  on public.candidate_materials (candidate_id);
create index if not exists candidate_materials_center_idx
  on public.candidate_materials (center_id, first_issued_at desc);
create index if not exists candidate_materials_outstanding_idx
  on public.candidate_materials (center_id)
  where issued_count > returned_count + written_off_count;

alter table public.candidate_materials enable row level security;

drop policy if exists candidate_materials_read on public.candidate_materials;
create policy candidate_materials_read on public.candidate_materials
  for select to authenticated
  using (center_id = (select center_id from public.profiles where id = auth.uid()));

revoke all on public.candidate_materials from public, anon, authenticated;
grant select on public.candidate_materials to authenticated;

/**
 * Hands something over. Issuing the same thing twice adds to the count rather
 * than opening a second row, because the desk thinks in "three sheets", not in
 * "an issue of two and an issue of one".
 */
create or replace function public.fets_issue_material(
  p_candidate uuid,
  p_kind text,
  p_count integer default 1,
  p_label text default null
)
returns public.candidate_materials
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  m public.candidate_materials;
  k public.material_kinds;
  v_count integer := coalesce(p_count, 1);
  v_label text := coalesce(nullif(btrim(coalesce(p_label, '')), ''), '');
begin
  select * into c from public.candidates where id = p_candidate;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(
    c.center_id, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  select * into k from public.material_kinds where code = p_kind and active;
  if not found then
    raise exception 'there is no such thing to issue (%)', p_kind using errcode = 'P0002';
  end if;

  if v_count < 1 or v_count > 99 then
    raise exception 'issue between 1 and 99 at a time' using errcode = 'P0001';
  end if;

  if c.status in ('signed_out', 'no_show') then
    raise exception 'they have already left' using errcode = 'P0001';
  end if;

  -- Checked here rather than left to the column constraint, so a fat finger on
  -- the count gets a sentence instead of a constraint name.
  if v_count + coalesce(
       (select issued_count from public.candidate_materials
         where candidate_id = c.id and kind = k.code and label = v_label), 0) > 99 then
    raise exception 'that would be more than 99 %; log an incident instead', lower(k.label)
      using errcode = 'P0001';
  end if;

  insert into public.candidate_materials
    (center_id, exam_session_id, candidate_id, kind, label, issued_count, issued_by)
  values (c.center_id, c.exam_session_id, c.id, k.code, v_label, v_count, auth.uid())
  on conflict (candidate_id, kind, label) do update
     set issued_count  = candidate_materials.issued_count + excluded.issued_count,
         last_issued_at = now(),
         issued_by     = auth.uid()
  returning * into m;

  perform public.fets_log_event(
    c.id, c.center_id, 'material.issued', c.status, c.status,
    format('%s × %s', v_count, coalesce(nullif(v_label, ''), k.label)),
    jsonb_build_object('kind', k.code, 'label', v_label, 'count', v_count,
                       'held', m.issued_count - m.returned_count - m.written_off_count)
  );

  return m;
end;
$fn$;

/**
 * Takes it back. With no count it takes back everything still out, which is
 * what the sign-out desk actually does -- they are not counting pencils twice.
 */
create or replace function public.fets_return_material(
  p_candidate uuid,
  p_kind text,
  p_count integer default null,
  p_label text default null
)
returns public.candidate_materials
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  m public.candidate_materials;
  v_label text := coalesce(nullif(btrim(coalesce(p_label, '')), ''), '');
  v_held integer;
  v_take integer;
begin
  select * into c from public.candidates where id = p_candidate;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(
    c.center_id, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  select * into m from public.candidate_materials
   where candidate_id = p_candidate and kind = p_kind and label = v_label
   for update;
  if not found then
    raise exception 'nothing of that sort was issued to them' using errcode = 'P0002';
  end if;

  v_held := m.issued_count - m.returned_count - m.written_off_count;
  if v_held <= 0 then
    raise exception 'that is already all accounted for' using errcode = 'P0001';
  end if;

  v_take := least(coalesce(p_count, v_held), v_held);
  if v_take < 1 then
    raise exception 'take back at least one' using errcode = 'P0001';
  end if;

  update public.candidate_materials
     set returned_count = returned_count + v_take,
         returned_at    = now(),
         returned_by    = auth.uid()
   where id = m.id
  returning * into m;

  perform public.fets_log_event(
    c.id, c.center_id, 'material.returned', c.status, c.status,
    format('%s × %s back', v_take, coalesce(nullif(v_label, ''), m.kind)),
    jsonb_build_object('kind', m.kind, 'label', v_label, 'count', v_take,
                       'still_held', m.issued_count - m.returned_count - m.written_off_count)
  );

  return m;
end;
$fn$;

/**
 * It is not coming back. Says so on the record, and writes the incident,
 * because a scratch sheet that left the building is a thing the board asks
 * about later and nobody will remember it by then.
 */
create or replace function public.fets_write_off_material(
  p_material uuid,
  p_reason text
)
returns public.candidate_materials
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  m public.candidate_materials;
  c public.candidates;
  k public.material_kinds;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_held integer;
begin
  select * into m from public.candidate_materials where id = p_material for update;
  if not found then raise exception 'no such issue record' using errcode = 'P0002'; end if;

  perform public.fets_guard(
    m.center_id, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  if v_reason = '' then
    raise exception 'say why it is not coming back' using errcode = 'P0001';
  end if;

  v_held := m.issued_count - m.returned_count - m.written_off_count;
  if v_held <= 0 then
    raise exception 'that is already all accounted for' using errcode = 'P0001';
  end if;

  select * into c from public.candidates where id = m.candidate_id;
  select * into k from public.material_kinds where code = m.kind;

  update public.candidate_materials
     set written_off_count  = written_off_count + v_held,
         written_off_at     = now(),
         written_off_reason = v_reason
   where id = m.id
  returning * into m;

  perform public.fets_log_incident(
    m.center_id,
    'conduct',
    format('%s × %s not returned by %s',
           v_held, coalesce(nullif(m.label, ''), lower(k.label)), c.public_token),
    'major',
    v_reason,
    c.id,
    null,
    now(),
    true
  );

  return m;
end;
$fn$;

/**
 * The last step of the day for one person: they hand everything back and go.
 *
 * This is deliberately its own call rather than another stage advance. It is
 * the only place that knows the desk is meant to be counting things in, and it
 * refuses while anything returnable is still out -- naming what is missing, so
 * the refusal is a help rather than a wall.
 */
create or replace function public.fets_sign_out(
  p_candidate uuid,
  p_note text default null
)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  v_from public.candidate_stage;
  v_missing text;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(
    c.center_id, array['admin', 'tca', 'front_office']::public.user_role[]);

  if c.status = 'signed_out' then
    raise exception 'they have already signed out' using errcode = 'P0001';
  end if;

  if c.status <> 'completed' then
    raise exception 'they have not finished the exam yet' using errcode = 'P0001';
  end if;

  select string_agg(
           format('%s × %s',
                  m.issued_count - m.returned_count - m.written_off_count,
                  lower(coalesce(nullif(m.label, ''), k.label))),
           ', ' order by k.sort_order)
    into v_missing
    from public.candidate_materials m
    join public.material_kinds k on k.code = m.kind
   where m.candidate_id = c.id
     and k.returnable
     and m.issued_count > m.returned_count + m.written_off_count;

  if v_missing is not null then
    raise exception 'still holding %  -- take it back, or write it off with a reason', v_missing
      using errcode = 'P0001';
  end if;

  v_from := c.status;

  update public.candidates
     set status = 'signed_out',
         signed_out_at = now()
   where id = p_candidate
  returning * into c;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.signed_out', v_from, c.status, p_note);

  return c;
end;
$fn$;

revoke all on function
  public.fets_issue_material(uuid, text, integer, text),
  public.fets_return_material(uuid, text, integer, text),
  public.fets_write_off_material(uuid, text),
  public.fets_sign_out(uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.fets_issue_material(uuid, text, integer, text),
  public.fets_return_material(uuid, text, integer, text),
  public.fets_write_off_material(uuid, text),
  public.fets_sign_out(uuid, text)
  to authenticated;

-- The console subscribes to these three but they were never in the publication,
-- so the browser only saw them on a full page load. Incidents and labs have
-- been quietly missing their live updates since they were added.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public'
                      and tablename = 'candidate_materials') then
      alter publication supabase_realtime add table public.candidate_materials;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public'
                      and tablename = 'incidents') then
      alter publication supabase_realtime add table public.incidents;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public'
                      and tablename = 'labs') then
      alter publication supabase_realtime add table public.labs;
    end if;
  end if;
end
$$;
