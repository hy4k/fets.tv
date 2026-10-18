-- Booked slots for exams whose candidates are not in fets.live yet.
--
-- Only CMA US has its candidates uploaded to fets.live. For every other exam
-- the calendar knows how many are booked ("CELPIP · 09:00 · 6") but not who,
-- so a pull brought nobody across and the desk had nothing to check in.
--
-- A pull now also takes the calendar's counts for those exams and keeps that
-- many empty "booked slot" rows on the day's list. At check-in the desk types
-- the name and confirmation number from the candidate's ID and booking
-- (fets_fill_slot), and the row becomes an ordinary candidate.
--
-- Pulling again keeps the slots in step with the calendar: a higher count adds
-- slots, a lower one removes only slots nobody has touched, and a slot that
-- has been filled in is never removed. When fets.live later carries the real
-- names for that exam and time, the untouched slots go and the names come in;
-- a filled slot whose confirmation number matches is updated in place.
--
-- Run once in the fets.online Supabase project (ueufcqmdqtwvhjjyudeu).

begin;

alter table public.candidates add column if not exists placeholder boolean not null default false;

drop function if exists public.fets_sync_live_roster(uuid, date, jsonb);

create or replace function public.fets_sync_live_roster(p_center uuid,p_day date,p_rows jsonb,p_slots jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sess uuid; v_status text; v_today date := (now() at time zone 'Asia/Kolkata')::date; v_future boolean; row jsonb; cid uuid; inserted integer:=0; updated integer:=0; seq integer; existing_count integer;
 slot jsonb; v_at timestamptz; v_have integer; v_want integer; slots_added integer:=0; slots_removed integer:=0; v_gone integer;
begin
 if p_center is null or p_day is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid roster context'; end if;
 if jsonb_typeof(coalesce(p_slots,'[]'::jsonb)) is distinct from 'array' then raise exception 'Invalid booked slots'; end if;
 p_slots := coalesce(p_slots,'[]'::jsonb);
 if not exists(select 1 from public.centers where id=p_center and active) then raise exception 'Unknown centre'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'client_name',r->>'roster_number' having count(*)>1) then raise exception 'Duplicate provider IDs in source'; end if;
 if jsonb_array_length(p_rows)>5000 then raise exception 'Roster exceeds 5000 rows'; end if;
 if p_day < v_today then raise exception 'A past day cannot be pulled'; end if;
 -- A later day is prepared, not opened: today's list stays the live one.
 v_future := p_day > v_today;
 perform pg_advisory_xact_lock(hashtextextended('fets-live-roster:'||p_center::text,0));
 -- Reuse today's existing session, including a previous manual import, so check-in progress survives cutover.
 select id, status into sess, v_status from public.exam_sessions where center_id=p_center and exam_date=p_day order by (status in ('live','ready')) desc,(status='draft') desc,created_at desc limit 1;
 if sess is null and jsonb_array_length(p_rows)=0 and jsonb_array_length(p_slots)=0 then return jsonb_build_object('inserted',0,'updated',0,'session_id',null); end if;
 if sess is null and v_future then
  insert into public.exam_sessions(center_id,exam_date,exam_name,source_filename,status) values(p_center,p_day,'FETS LIVE · Daily candidates','fets.live','draft') returning id into sess;
 elsif sess is null or (v_status='draft' and not v_future) then
  -- Today becomes the live list: a fresh one, or the one prepared earlier.
  if exists(select 1 from public.candidates c join public.exam_sessions s on s.id=c.exam_session_id where s.center_id=p_center and s.status in ('live','ready') and s.id is distinct from sess and c.status in ('arrived','id_checked','waiting','frisking','biometrics','assigned','lab_entry','testing')) then
   raise exception 'Previous day still has active candidates; close their work before starting a new day';
  end if;
  -- Close the old live list and any stale draft, but never a later prepared day.
  update public.exam_sessions set status='closed' where center_id=p_center and id is distinct from sess and (status in ('live','ready') or (status='draft' and exam_date<=p_day));
  update public.public_display_calls set active=false where center_id=p_center and active;
  if sess is null then
   insert into public.exam_sessions(center_id,exam_date,exam_name,source_filename,status) values(p_center,p_day,'FETS LIVE · Daily candidates','fets.live','live') returning id into sess;
  else
   update public.exam_sessions set status='live' where id=sess;
  end if;
 elsif v_status='closed' then
  raise exception 'This day was closed; reopen it before pulling more candidates';
 end if;
 select coalesce(max(substring(public_token from '^FETS-([0-9]+)$')::integer),0) into seq from public.candidates where exam_session_id=sess;
 for row in select value from jsonb_array_elements(p_rows) loop
  if nullif(btrim(row->>'roster_number'),'') is null or nullif(btrim(row->>'full_name'),'') is null or nullif(btrim(row->>'exam_name'),'') is null or coalesce(row->>'client_name','') not in ('PROMETRIC','PEARSON VUE','CELPIP','PSI','ITTS') or coalesce(row->>'exam_start_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then raise exception 'Incomplete source candidate; correct it in fets.live'; end if;
  select id into cid from public.candidates where exam_session_id=sess and live_provider=row->>'client_name' and roster_number=row->>'roster_number';
  if cid is null then
   -- An unlabelled legacy row can be adopted only when its ID and whole name agree and the upstream ID is unambiguous.
   select count(*) into existing_count from public.candidates where exam_session_id=sess and live_provider is null and roster_number=row->>'roster_number';
   if existing_count>0 then
    if (select count(*) from jsonb_array_elements(p_rows) r where r->>'roster_number'=row->>'roster_number')<>1 then raise exception 'Provider ID overlaps a legacy roster; review the existing candidate before syncing'; end if;
    select id into cid from public.candidates where exam_session_id=sess and live_provider is null and roster_number=row->>'roster_number' and lower(btrim(first_name||' '||last_name))=lower(btrim(row->>'full_name'));
    if cid is null then raise exception 'Legacy candidate name differs for a matching ID; review before syncing'; end if;
   end if;
  end if;
  if cid is null then
   seq:=seq+1;
   insert into public.candidates(exam_session_id,center_id,roster_number,first_name,last_name,part,phone,scheduled_at,public_token,status,live_provider,live_exam_name,live_source_status,programme_id)
   values(sess,p_center,row->>'roster_number',row->>'full_name','',nullif(row->>'exam_part',''),nullif(row->>'phone',''),(p_day::text||'T'||(row->>'exam_start_time')||'+05:30')::timestamptz,'FETS-'||lpad(seq::text,4,'0'),'scheduled',row->>'client_name',row->>'exam_name',row->>'status',
    (select id from public.exam_programmes where center_id=p_center and active and lower(name)=lower(row->>'exam_name') order by id limit 1));
   inserted:=inserted+1;
  else
   -- Never overwrite the exam-day status, locker, seat, timestamps, materials, calls or clock.
   -- What staff corrected on this console wins over fets.live: a field with a
   -- details_edited event is left alone. A blank in fets.live never erases a
   -- value already here.
   update public.candidates c set
    first_name=case when e.name_edited then c.first_name else row->>'full_name' end,
    last_name=case when e.name_edited then c.last_name else '' end,
    part=case when e.part_edited then c.part else coalesce(nullif(btrim(row->>'exam_part'),''),c.part) end,
    phone=case when e.phone_edited then c.phone else coalesce(nullif(btrim(row->>'phone'),''),c.phone) end,
    scheduled_at=(p_day::text||'T'||(row->>'exam_start_time')||'+05:30')::timestamptz,live_provider=row->>'client_name',live_exam_name=row->>'exam_name',live_source_status=row->>'status',
    placeholder=false
   from (select coalesce(bool_or(ev.metadata_json->'fields' ? 'name'),false) name_edited,
                coalesce(bool_or(ev.metadata_json->'fields' ? 'part'),false) part_edited,
                coalesce(bool_or(ev.metadata_json->'fields' ? 'phone'),false) phone_edited
           from public.candidate_events ev where ev.candidate_id=cid and ev.event_type='details_edited') e
   where c.id=cid;
   updated:=updated+1;
  end if;
 end loop;

 -- Booked slots: as many rows per exam and start time as the calendar books,
 -- counting slots already filled in. Only untouched slots are ever removed.
 for slot in select value from jsonb_array_elements(p_slots) loop
  if coalesce(slot->>'client_name','') not in ('PROMETRIC','PEARSON VUE','CELPIP','PSI','ITTS') or nullif(btrim(slot->>'exam_name'),'') is null or coalesce(slot->>'start_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(slot->>'count','') !~ '^[0-9]{1,3}$' then raise exception 'Invalid booked slot from the calendar'; end if;
  v_at := (p_day::text||'T'||(slot->>'start_time')||':00+05:30')::timestamptz;
  v_want := (slot->>'count')::integer;
  select count(*) into v_have from public.candidates where exam_session_id=sess and live_provider=slot->>'client_name' and upper(btrim(live_exam_name))=upper(btrim(slot->>'exam_name')) and scheduled_at=v_at;
  while v_have < v_want loop
   seq:=seq+1;
   insert into public.candidates(exam_session_id,center_id,roster_number,first_name,last_name,scheduled_at,public_token,status,live_provider,live_exam_name,placeholder,programme_id)
   values(sess,p_center,'SLOT-'||lpad(seq::text,4,'0'),'Booked slot','',v_at,'FETS-'||lpad(seq::text,4,'0'),'scheduled',slot->>'client_name',btrim(slot->>'exam_name'),true,
    (select id from public.exam_programmes where center_id=p_center and active and lower(name)=lower(btrim(slot->>'exam_name')) order by id limit 1));
   v_have:=v_have+1; slots_added:=slots_added+1;
  end loop;
  if v_have > v_want then
   delete from public.candidates where id in (
    select c.id from public.candidates c
     where c.exam_session_id=sess and c.placeholder and c.status='scheduled' and c.check_in_at is null
       and c.live_provider=slot->>'client_name' and upper(btrim(c.live_exam_name))=upper(btrim(slot->>'exam_name')) and c.scheduled_at=v_at
       and not exists(select 1 from public.candidate_events ev where ev.candidate_id=c.id)
     order by c.public_token desc limit v_have-v_want);
   get diagnostics v_gone = row_count; slots_removed:=slots_removed+v_gone;
  end if;
 end loop;
 -- A slot whose exam and time the calendar no longer books without names
 -- (cancelled, or the names have arrived) goes, if nobody has touched it.
 delete from public.candidates c
  where c.exam_session_id=sess and c.placeholder and c.status='scheduled' and c.check_in_at is null
    and not exists(select 1 from public.candidate_events ev where ev.candidate_id=c.id)
    and not exists(select 1 from jsonb_array_elements(p_slots) s
                    where s->>'client_name'=c.live_provider and upper(btrim(s->>'exam_name'))=upper(btrim(c.live_exam_name))
                      and (p_day::text||'T'||(s->>'start_time')||':00+05:30')::timestamptz=c.scheduled_at);
 get diagnostics v_gone = row_count; slots_removed:=slots_removed+v_gone;

 update public.exam_sessions set live_synced_at=now() where id=sess;
 return jsonb_build_object('inserted',inserted,'updated',updated,'session_id',sess,'prepared',v_future,
  'slots_added',slots_added,'slots_removed',slots_removed,
  'slots',(select count(*) from public.candidates where exam_session_id=sess and placeholder),
  -- Not in the source: everybody except the rows just pulled, the empty
  -- slots, and slots already filled in for an exam the calendar still books.
  'retained',(select count(*) from public.candidates where exam_session_id=sess and not placeholder)
    - jsonb_array_length(p_rows)
    - (select count(*) from public.candidates c where c.exam_session_id=sess and not c.placeholder
         and exists(select 1 from jsonb_array_elements(p_slots) s where s->>'client_name'=c.live_provider and upper(btrim(s->>'exam_name'))=upper(btrim(c.live_exam_name))
                      and (p_day::text||'T'||(s->>'start_time')||':00+05:30')::timestamptz=c.scheduled_at)));
end; $$;

revoke all on function public.fets_sync_live_roster(uuid,date,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.fets_sync_live_roster(uuid,date,jsonb,jsonb) to service_role;

/**
 * The desk fills a booked slot from the candidate's ID and booking: the name
 * and the confirmation number are required, the phone is optional. The slot
 * then is an ordinary candidate, ready to be checked in.
 */
create or replace function public.fets_fill_slot(p_candidate uuid, p_name text, p_number text, p_phone text default null)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_number text := btrim(coalesce(p_number, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_other text;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'tca', 'front_office']::public.user_role[]);

  if not c.placeholder then
    raise exception 'this candidate already has their details' using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception 'enter the name as it is on their ID' using errcode = 'P0001';
  end if;
  if v_number = '' then
    raise exception 'enter the confirmation number from their booking' using errcode = 'P0001';
  end if;
  if length(v_name) > 200 or length(v_number) > 60 or length(coalesce(v_phone, '')) > 40 then
    raise exception 'one of the details is too long' using errcode = 'P0001';
  end if;

  select btrim(first_name || ' ' || last_name) into v_other from public.candidates
   where exam_session_id = c.exam_session_id and roster_number = v_number and id <> c.id
     and live_provider is not distinct from c.live_provider
   limit 1;
  if v_other is not null then
    raise exception 'confirmation number % is already % today', v_number, v_other using errcode = 'P0001';
  end if;

  update public.candidates
     set first_name = v_name,
         last_name = '',
         roster_number = v_number,
         phone = coalesce(v_phone, phone),
         placeholder = false
   where id = c.id
  returning * into c;

  perform public.fets_log_event(c.id, c.center_id, 'details_edited', c.status, c.status,
    'booked slot filled in at the desk',
    jsonb_build_object('fields', jsonb_build_array('name', 'confirmation', 'phone'), 'slot', true));
  return c;
end;
$fn$;

revoke all on function public.fets_fill_slot(uuid, text, text, text) from public, anon;
grant execute on function public.fets_fill_slot(uuid, text, text, text) to authenticated;

/** Check-in, now refusing a booked slot that nobody has filled in. */
create or replace function public.fets_check_in_one(p_candidate uuid, p_name_note text default null)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  v_from public.candidate_stage;
  v_note text := nullif(btrim(coalesce(p_name_note, '')), '');
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(c.center_id, array['admin', 'front_office']::public.user_role[]);

  if c.placeholder then
    raise exception 'enter their name and confirmation number first' using errcode = 'P0001';
  end if;
  if c.status not in ('scheduled', 'arrived', 'id_checked') then
    raise exception 'already checked in (status is %)', c.status using errcode = 'P0001';
  end if;
  if v_note is not null and length(v_note) > 1000 then
    raise exception 'keep the name note under 1000 characters' using errcode = 'P0001';
  end if;

  v_from := c.status;
  update public.candidates
     set arrival_at = coalesce(arrival_at, now()),
         id_verified_at = coalesce(id_verified_at, now()),
         check_in_at = now(),
         status = 'waiting'
   where id = p_candidate
  returning * into c;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.checked_in', v_from, c.status,
    v_note, case when v_note is null then '{}'::jsonb else jsonb_build_object('name_mismatch', v_note) end);

  if v_note is not null then
    insert into public.incidents
      (center_id, exam_session_id, kind, severity, summary, detail, candidate_id,
       started_at, resolved_at, resolution, minutes_lost, reportable, logged_by, resolved_by)
    values
      (c.center_id, c.exam_session_id, 'candidate', 'minor',
       'Name on ID does not match the roster', v_note, c.id,
       now(), now(), 'Noted at check-in; candidate admitted.', 0, true, auth.uid(), auth.uid());
  end if;

  return c;
end;
$fn$;

revoke all on function public.fets_check_in_one(uuid, text) from public, anon, authenticated;
grant execute on function public.fets_check_in_one(uuid, text) to authenticated;

commit;
