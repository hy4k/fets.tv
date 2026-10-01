-- Run in fets.online Supabase project ueufcqmdqtwvhjjyudeu only.
begin;
alter table public.candidates add column if not exists live_provider text,
 add column if not exists live_exam_name text, add column if not exists live_source_status text;
alter table public.exam_sessions add column if not exists live_synced_at timestamptz;
-- The upstream contract distinguishes the same provider ID across providers.
drop index if exists public.candidates_session_roster_idx;
create unique index candidates_provider_roster_idx on public.candidates(exam_session_id,coalesce(live_provider,''),roster_number);
create or replace function public.fets_sync_live_roster(p_center uuid,p_day date,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sess uuid; row jsonb; cid uuid; inserted integer:=0; updated integer:=0; seq integer; existing_count integer;
begin
 if p_center is null or p_day is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid roster context'; end if;
 if not exists(select 1 from public.centers where id=p_center and active) then raise exception 'Unknown centre'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'client_name',r->>'roster_number' having count(*)>1) then raise exception 'Duplicate provider IDs in source'; end if;
 if jsonb_array_length(p_rows)>5000 then raise exception 'Roster exceeds 5000 rows'; end if;
 if p_day<>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Only today can be activated'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fets-live-roster:'||p_center::text,0));
 -- Reuse today's existing session, including a previous manual import, so check-in progress survives cutover.
 select id into sess from public.exam_sessions where center_id=p_center and exam_date=p_day order by (status in ('live','ready')) desc,created_at desc limit 1;
 if sess is null and jsonb_array_length(p_rows)=0 then return jsonb_build_object('inserted',0,'updated',0,'session_id',null); end if;
 if sess is null then
  if exists(select 1 from public.candidates c join public.exam_sessions s on s.id=c.exam_session_id where s.center_id=p_center and s.status in ('live','ready') and c.status in ('arrived','id_checked','waiting','frisking','biometrics','assigned','lab_entry','testing')) then
   raise exception 'Previous day still has active candidates; close their work before starting a new day';
  end if;
  update public.exam_sessions set status='closed' where center_id=p_center and status in ('live','ready','draft');
  update public.public_display_calls set active=false where center_id=p_center and active;
  insert into public.exam_sessions(center_id,exam_date,exam_name,source_filename,status) values(p_center,p_day,'FETS LIVE · Daily candidates','fets.live','live') returning id into sess;
 elsif exists(select 1 from public.exam_sessions where id=sess and status='closed') then
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
   update public.candidates set first_name=row->>'full_name',last_name='',part=nullif(row->>'exam_part',''),phone=nullif(row->>'phone',''),scheduled_at=(p_day::text||'T'||(row->>'exam_start_time')||'+05:30')::timestamptz,live_provider=row->>'client_name',live_exam_name=row->>'exam_name',live_source_status=row->>'status' where id=cid;
   updated:=updated+1;
  end if;
 end loop;
 update public.exam_sessions set live_synced_at=now() where id=sess;
 return jsonb_build_object('inserted',inserted,'updated',updated,'session_id',sess,'retained', (select count(*) from public.candidates where exam_session_id=sess)-jsonb_array_length(p_rows));
end; $$;
revoke all on function public.fets_sync_live_roster(uuid,date,jsonb) from public,anon,authenticated;
grant execute on function public.fets_sync_live_roster(uuid,date,jsonb) to service_role;
notify pgrst,'reload schema';
commit;

select 'READY — fets.online roster sync installed' as status;
