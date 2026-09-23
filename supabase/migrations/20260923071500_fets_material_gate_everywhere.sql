-- The gate was only on one door.
--
-- fets_sign_out refuses while a candidate still holds scratch sheets, but it is
-- not the only way to reach 'signed_out': fets_advance_stage walks the same
-- last step and is granted to lab staff, so the check could simply be walked
-- around. Closing the day had the matching hole at the other end -- once a
-- session is closed the console stops loading it, so anything still out became
-- invisible and unreturnable while the database went on refusing the sign-out.
--
-- The rule now lives in one function that every door calls.

/**
 * What a candidate is still holding, as one line, or null if nothing.
 *
 * Internal: every caller is already a security-definer function of ours, so it
 * is not granted to anybody. Callers read it through their own privileges.
 */
create or replace function public.fets_material_debt(p_candidate uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select string_agg(
           format('%s × %s',
                  m.issued_count - m.returned_count - m.written_off_count,
                  lower(coalesce(nullif(m.label, ''), k.label))),
           ', ' order by k.sort_order)
    from public.candidate_materials m
    join public.material_kinds k on k.code = m.kind
   where m.candidate_id = p_candidate
     and k.returnable
     and m.issued_count > m.returned_count + m.written_off_count;
$fn$;

revoke all on function public.fets_material_debt(uuid) from public, anon, authenticated;

/** Sign-out, now asking the shared rule rather than carrying its own copy. */
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

  v_missing := public.fets_material_debt(c.id);
  if v_missing is not null then
    raise exception 'still holding % — take it back, or write it off with a reason', v_missing
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

/**
 * Walking the stages on. The last stage is a sign-out like any other, so it
 * answers to the same rule; fets_admin_override stays the one deliberate way
 * past it, which is what an override is for.
 */
create or replace function public.fets_advance_stage(p_candidate uuid, p_note text default null)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.candidates;
  r public.schedule_rules;
  v_from public.candidate_stage;
  v_next public.candidate_stage;
  v_missing text;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'lab_staff']::public.user_role[]);

  select * into r from public.schedule_rules where center_id = c.center_id;
  v_from := c.status;
  v_next := public.fets_next_status(c.status, coalesce(r.frisking_enabled, true), coalesce(r.biometrics_enabled, true));

  if v_next is null then
    raise exception 'candidate is already at the end of the workflow (%)', c.status using errcode = 'P0001';
  end if;

  if v_next = 'lab_entry' and c.workstation_id is null then
    raise exception 'assign a workstation before lab entry' using errcode = 'P0001';
  end if;

  if v_next = 'signed_out' then
    v_missing := public.fets_material_debt(c.id);
    if v_missing is not null then
      raise exception 'still holding % — take it back, or write it off with a reason', v_missing
        using errcode = 'P0001';
    end if;
  end if;

  update public.candidates
     set status = v_next,
         frisked_at = case when v_next = 'biometrics' then coalesce(frisked_at, now()) else frisked_at end,
         biometrics_at = case when v_next = 'assigned' then coalesce(biometrics_at, now()) else biometrics_at end,
         lab_entry_at = case when v_next = 'lab_entry' then now() else lab_entry_at end,
         testing_started_at = case when v_next = 'testing' then now() else testing_started_at end,
         completed_at = case when v_next = 'completed' then now() else completed_at end,
         signed_out_at = case when v_next = 'signed_out' then now() else signed_out_at end,
         workstation_id = case when v_next = 'completed' then null else workstation_id end
   where id = p_candidate
  returning * into c;

  if v_next = 'testing' then
    update public.workstations set status = 'active' where current_candidate_id = c.id;
  elsif v_next = 'completed' then
    update public.workstations set status = 'free', current_candidate_id = null where current_candidate_id = c.id;
  end if;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.status_changed', v_from, c.status, p_note);
  return c;
end;
$$;

/**
 * Issuing takes the same lock the sign-out takes.
 *
 * Without it two desks can cross: the sign-out sees no debt and commits while
 * an issue is in flight, and the candidate walks out holding a sheet the
 * record says was returned. The lock makes the two serialize, and the status
 * is read after it is held.
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
  select * into c from public.candidates where id = p_candidate for update;
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
 * Closing the day, which is the last chance to notice a missing sheet.
 *
 * Once a session is closed the console stops loading it, and with it the only
 * place to take something back or write it off. So the day cannot close over
 * an outstanding item: it names who is still holding one.
 */
create or replace function public.fets_close_day(p_center uuid)
returns public.exam_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s public.exam_sessions;
  v_testing integer;
  v_holding text;
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  select * into s from public.exam_sessions
   where center_id = p_center and status in ('draft', 'ready', 'live')
   order by created_at desc limit 1;

  if not found then
    raise exception 'there is no open day to close' using errcode = 'P0002';
  end if;

  -- Somebody still at a workstation means the day is not over, whatever the
  -- clock says. Finishing them is a deliberate act on the Live Floor.
  select count(*) into v_testing
    from public.candidates
   where exam_session_id = s.id and exam_started_at is not null and exam_finished_at is null;

  if v_testing > 0 then
    raise exception '% candidate(s) are still sitting the exam', v_testing using errcode = 'P0001';
  end if;

  select string_agg(distinct c.public_token, ', ' order by c.public_token)
    into v_holding
    from public.candidates c
    join public.candidate_materials m on m.candidate_id = c.id
    join public.material_kinds k on k.code = m.kind
   where c.exam_session_id = s.id
     and k.returnable
     and m.issued_count > m.returned_count + m.written_off_count;

  if v_holding is not null then
    raise exception '% still hold something — take it back, or write it off, before closing', v_holding
      using errcode = 'P0001';
  end if;

  update public.exam_sessions set status = 'closed' where id = s.id returning * into s;

  update public.public_display_calls set active = false
   where center_id = p_center and active;

  update public.display_notices set active = false, cleared_at = now(), cleared_by = auth.uid()
   where center_id = p_center and active;

  update public.candidates set called_at = null
   where center_id = p_center and called_at is not null;

  update public.workstations set status = 'free', current_candidate_id = null
   where center_id = p_center and status <> 'fault';

  return s;
end;
$fn$;
