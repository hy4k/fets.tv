-- Today's roster comes from fets.live now, and it keeps coming: late bookings
-- are added there during the day and must reach the desk without wiping out
-- anybody's progress. fets_import_roster cannot do that — it closes the day and
-- starts again — so this is its gentle sibling.
--
-- It is safe to run again and again:
--   * a roster number not yet on today's list is added, with the next token;
--   * one already on it is refreshed (name, part, phone, time) only while that
--     candidate is still scheduled — once they have arrived, the desk's record
--     is the truth;
--   * nobody is ever removed. A booking dropped in fets.live after someone has
--     checked in is for staff to sort out, not for a sync to erase.
--
-- If today has no open list yet, one is opened, closing any older one exactly
-- as an import would. If today already has one — uploaded, by hand, or an
-- earlier sync — it is added to rather than replaced.

create or replace function public.fets_sync_roster(
  p_center uuid,
  p_exam_date date,
  p_exam_name text,
  p_source text,
  p_rows jsonb,
  p_programme uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  r public.schedule_rules;
  v_session uuid;
  v_row jsonb;
  v_roster text;
  v_seq integer;
  v_slot timestamptz;
  v_default timestamptz;
  v_tz text;
  v_first text;
  v_last text;
  v_part text;
  v_phone text;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_kept integer := 0;
  v_skipped integer := 0;
  v_count integer;
begin
  perform public.fets_guard(p_center, array['admin', 'tca', 'front_office']::public.user_role[]);

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'no rows to bring in' using errcode = 'P0001';
  end if;

  if p_programme is not null and not exists (
    select 1 from public.exam_programmes where id = p_programme and center_id = p_center and active
  ) then
    raise exception 'that exam does not belong to this center' using errcode = 'P0002';
  end if;

  select timezone into v_tz from public.centers where id = p_center;
  select * into r from public.schedule_rules where center_id = p_center;
  -- Where a booking has no start time: the centre's first slot, else 9 am.
  v_default := (p_exam_date + coalesce(r.exam_start, time '09:00')) at time zone coalesce(v_tz, 'Asia/Kolkata');

  select id into v_session
    from public.exam_sessions
   where center_id = p_center and status in ('draft', 'ready', 'live') and exam_date = p_exam_date
   order by created_at desc
   limit 1;

  if v_session is null then
    update public.exam_sessions set status = 'closed'
     where center_id = p_center and status in ('draft', 'ready', 'live');

    -- As in an import: a call left over from the list just closed would keep
    -- its candidate on the TV.
    update public.public_display_calls set active = false
     where center_id = p_center and active;
    update public.candidates set called_at = null
     where center_id = p_center and called_at is not null;

    insert into public.exam_sessions
      (center_id, exam_date, exam_name, source_filename, status, created_by, programme_id)
    values (p_center, p_exam_date, coalesce(nullif(btrim(p_exam_name), ''), 'Today'),
            nullif(btrim(coalesce(p_source, '')), ''), 'live', auth.uid(), p_programme)
    returning id into v_session;
  else
    -- Two desks pressing at once would otherwise both pick the same next token.
    perform 1 from public.exam_sessions where id = v_session for update;
    update public.exam_sessions
       set programme_id = coalesce(programme_id, p_programme),
           source_filename = coalesce(source_filename, nullif(btrim(coalesce(p_source, '')), ''))
     where id = v_session;
  end if;

  select coalesce(max(nullif(regexp_replace(public_token, '\D', '', 'g'), '')::integer), 0)
    into v_seq
    from public.candidates
   where exam_session_id = v_session;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_roster := btrim(coalesce(v_row ->> 'roster_number', ''));
    v_first := btrim(coalesce(v_row ->> 'first_name', ''));
    v_last := btrim(coalesce(v_row ->> 'last_name', ''));
    if v_roster = '' or (v_first = '' and v_last = '') then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_part := nullif(btrim(coalesce(v_row ->> 'part', '')), '');
    v_phone := nullif(btrim(coalesce(v_row ->> 'phone', '')), '');
    begin
      v_slot := coalesce(nullif(v_row ->> 'scheduled_at', '')::timestamptz, v_default);
    exception when others then
      v_slot := v_default;
    end;

    update public.candidates
       set first_name = v_first,
           last_name = v_last,
           part = coalesce(v_part, part),
           phone = coalesce(v_phone, phone),
           scheduled_at = v_slot
     where exam_session_id = v_session
       and roster_number = v_roster
       and status = 'scheduled'
       and (first_name, last_name, coalesce(part, ''), coalesce(phone, ''), scheduled_at)
           is distinct from (v_first, v_last, coalesce(v_part, part, ''), coalesce(v_phone, phone, ''), v_slot);
    get diagnostics v_count = row_count;
    if v_count > 0 then
      v_updated := v_updated + v_count;
      continue;
    end if;

    if exists (select 1 from public.candidates where exam_session_id = v_session and roster_number = v_roster) then
      v_kept := v_kept + 1;
      continue;
    end if;

    v_seq := v_seq + 1;
    insert into public.candidates (
      exam_session_id, center_id, roster_number, first_name, last_name,
      part, phone, public_token, status, scheduled_at, programme_id
    )
    values (
      v_session, p_center, v_roster, v_first, v_last,
      v_part, v_phone, 'FETS-' || lpad(v_seq::text, 3, '0'), 'scheduled', v_slot,
      coalesce(p_programme, (select programme_id from public.exam_sessions where id = v_session))
    );
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'exam_session_id', v_session,
    'inserted', v_inserted,
    'updated', v_updated,
    'unchanged', v_kept,
    'skipped', v_skipped
  );
end;
$fn$;

revoke all on function public.fets_sync_roster(uuid, date, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.fets_sync_roster(uuid, date, text, text, jsonb, uuid) to authenticated;
