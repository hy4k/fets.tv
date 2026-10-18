const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFileSync} from 'node:fs'; import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid';
create type user_role as enum('admin','tca','front_office','lab_staff','viewer');
create type candidate_stage as enum('scheduled','arrived','id_checked','waiting','frisking','biometrics','assigned','lab_entry','testing','completed','signed_out','no_show');
create table centers(id uuid primary key,active boolean);
create table exam_sessions(id uuid primary key default gen_random_uuid(),center_id uuid,exam_date date,exam_name text,source_filename text,status text,created_at timestamptz default now(),live_synced_at timestamptz);
create table exam_programmes(id uuid primary key,center_id uuid,active boolean,name text);
create table candidates(id uuid primary key default gen_random_uuid(),exam_session_id uuid,center_id uuid,roster_number text,first_name text,last_name text,part text,phone text,scheduled_at timestamptz,public_token text,status candidate_stage,programme_id uuid,locker_key text,check_in_at timestamptz,arrival_at timestamptz,id_verified_at timestamptz,live_provider text,live_exam_name text,live_source_status text,unique(exam_session_id,public_token));
create unique index candidates_provider_roster_idx on candidates(exam_session_id,coalesce(live_provider,''),roster_number);
create table candidate_events(id serial,candidate_id uuid,event_type text,metadata_json jsonb);
create table incidents(center_id uuid,exam_session_id uuid,kind text,severity text,summary text,detail text,candidate_id uuid,started_at timestamptz,resolved_at timestamptz,resolution text,minutes_lost int,reportable boolean,logged_by uuid,resolved_by uuid);
create table public_display_calls(center_id uuid,active boolean);
create function fets_guard(p uuid, r user_role[]) returns void language sql as 'select';
create function fets_log_event(c uuid, ce uuid, t text, f candidate_stage, s candidate_stage, n text, m jsonb default '{}') returns void language sql as $$ insert into public.candidate_events(candidate_id,event_type,metadata_json) values(c,t,m) $$;
insert into centers values('11111111-1111-4111-8111-111111111111',true);`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261018120000_fets_booked_slots.sql',import.meta.url),'utf8'));
const C='11111111-1111-4111-8111-111111111111';
const sync=async(rows,slots)=>(await db.query("select fets_sync_live_roster($1,(now() at time zone 'Asia/Kolkata')::date,$2::jsonb,$3::jsonb) as r",[C,JSON.stringify(rows),JSON.stringify(slots)])).rows[0].r;
const all=async()=>(await db.query("select * from candidates order by public_token")).rows;
const cma={roster_number:'8890001',full_name:'Sana Nasrin',exam_name:'CMA US',exam_start_time:'09:00:00',client_name:'PROMETRIC',status:'registered'};
const celpip={client_name:'CELPIP',exam_name:'CELPIP General',start_time:'09:00',count:3};
// 1. slots only, no session yet
let r=await sync([],[celpip]); assert.equal(r.slots_added,3); assert.equal(r.slots,3); assert.equal(r.retained,0);
// 2. with CMA rows, idempotent
r=await sync([cma],[celpip]); assert.equal(r.inserted,1); assert.equal(r.slots_added,0); assert.equal(r.slots_removed,0); assert.equal(r.retained,0);
let c=await all(); assert.equal(c.length,4); assert.equal(c.filter(x=>x.placeholder).length,3);
// 3. fill a slot, then check-in
const slot=c.find(x=>x.placeholder);
await assert.rejects(db.query('select fets_check_in_one($1)',[slot.id]),/name and confirmation/);
await assert.rejects(db.query("select fets_fill_slot($1,'Anu','')",[slot.id]),/confirmation number/);
await db.query("select fets_fill_slot($1,'  Anu   Mathew ','CEL-77','98470')",[slot.id]);
await db.query('select fets_check_in_one($1)',[slot.id]);
c=await all(); const filled=c.find(x=>x.id===slot.id); assert.equal(filled.first_name,'Anu Mathew'); assert.equal(filled.placeholder,false); assert.equal(filled.status,'waiting');
await assert.rejects(db.query("select fets_fill_slot($1,'X','Y')",[slot.id]),/already has/);
// 4. count drops to 1: filled stays, untouched slots go
r=await sync([cma],[{...celpip,count:1}]); assert.equal(r.slots_removed,2); assert.equal(r.retained,0);
c=await all(); assert.equal(c.length,2);
// 5. count rises to 4: 3 new slots
r=await sync([cma],[{...celpip,count:4}]); assert.equal(r.slots_added,3);
// 6. names arrive in fets.live for that group: untouched slots go; filled with matching number updated in place
r=await sync([cma,{roster_number:'CEL-77',full_name:'Anu Mathew',exam_name:'CELPIP General',exam_start_time:'09:00',client_name:'CELPIP',status:'registered'},{roster_number:'CEL-78',full_name:'Bibin K',exam_name:'CELPIP General',exam_start_time:'09:00',client_name:'CELPIP',status:'registered'}],[]);
assert.equal(r.inserted,1); assert.equal(r.updated,2); assert.equal(r.slots_removed,3); assert.equal(r.slots,0); assert.equal(r.retained,0);
c=await all(); assert.equal(c.length,3); assert.equal(c.find(x=>x.roster_number==='CEL-77').status,'waiting');
// 7. bad slot input rejected
await assert.rejects(sync([],[{...celpip,start_time:'9am'}]),/Invalid booked slot/);
// 8. duplicate confirmation number refused when filling
await sync([cma],[{client_name:'PSI',exam_name:'PSI Exam',start_time:'14:00',count:1}]);
const psi=(await all()).find(x=>x.placeholder);
await db.query("select fets_fill_slot($1,'Riya','P-1')",[psi.id]);
await sync([cma],[{client_name:'PSI',exam_name:'PSI Exam',start_time:'14:00',count:2}]);
const psi2=(await all()).find(x=>x.placeholder);
await assert.rejects(db.query("select fets_fill_slot($1,'Other','P-1')",[psi2.id]),/already Riya/);
// 9. service-only
await db.exec('set role authenticated'); await assert.rejects(sync([],[]),/permission denied/);
console.log('PASS: slots created from counts, fill + check-in, count down keeps filled, count up adds, names replace untouched slots, validation, duplicate number, service-only');
await db.close();
