// Runs the fets.live corrections migration against a throwaway database.
// PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/verify-live-corrections.mjs
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFileSync} from 'node:fs'; import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create table centers(id uuid primary key,name text);
create table exam_sessions(id uuid primary key,center_id uuid,exam_date date);
create table candidates(id uuid primary key default gen_random_uuid(),exam_session_id uuid,center_id uuid,roster_number text,first_name text,last_name text default '',phone text,place text,part text,live_provider text,placeholder boolean not null default false);
create table candidate_events(id uuid primary key default gen_random_uuid(),candidate_id uuid,event_type text,occurred_at timestamptz not null default now(),metadata_json jsonb not null default '{}');
insert into centers values('11111111-1111-4111-8111-111111111111','Calicut');
insert into exam_sessions values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','2026-10-19');
insert into candidates(id,exam_session_id,center_id,roster_number,first_name,live_provider,placeholder) values
 ('aaaaaaaa-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','889','Sana Nasrin','PROMETRIC',false),
 ('aaaaaaaa-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','MANUAL-001','Walk In',null,false),
 ('aaaaaaaa-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','C-1','Filled Slot','CELPIP',false);`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261019120000_fets_live_corrections.sql', import.meta.url), 'utf8'));
const ev = (id, meta) => db.query("insert into candidate_events(candidate_id,event_type,metadata_json) values($1,'details_edited',$2::jsonb)", [id, JSON.stringify(meta)]);
const pending = async () => (await db.query('select id from candidates where live_push_pending order by id')).rows.map(r => r.id.slice(-1));
await db.exec("update candidates set phone='9847' where id='aaaaaaaa-0000-4000-8000-000000000001'");
await ev('aaaaaaaa-0000-4000-8000-000000000001', { fields: ['phone'] });           // from fets.live: marked
await ev('aaaaaaaa-0000-4000-8000-000000000002', { fields: ['phone'] });           // walk-in: never sent
await ev('aaaaaaaa-0000-4000-8000-000000000003', { fields: ['name', 'confirmation', 'phone'], slot: true }); // desk-filled slot: never sent
await ev('aaaaaaaa-0000-4000-8000-000000000001', { fields: ['confirmation'] });    // number change alone: nothing to send
assert.deepEqual(await pending(), ['1']);
const q = (await db.query("select * from fets_live_push_queue('11111111-1111-4111-8111-111111111111')")).rows;
assert.equal(q.length, 1); assert.equal(q[0].full_name, 'Sana Nasrin'); assert.equal(q[0].phone, '9847'); assert.equal(q[0].center_name, 'Calicut');
assert.equal(String(q[0].exam_date instanceof Date ? q[0].exam_date.toISOString().slice(0, 10) : q[0].exam_date), '2026-10-19');
// An edit made after sending started keeps it waiting.
const before = new Date(Date.now() - 60000).toISOString();
assert.equal((await db.query('select fets_live_push_done($1,$2) n', [['aaaaaaaa-0000-4000-8000-000000000001'], before])).rows[0].n, 0);
assert.deepEqual(await pending(), ['1']);
const after = new Date(Date.now() + 1000).toISOString();
assert.equal((await db.query('select fets_live_push_done($1,$2) n', [['aaaaaaaa-0000-4000-8000-000000000001'], after])).rows[0].n, 1);
assert.deepEqual(await pending(), []);
await db.exec('set role authenticated');
await assert.rejects(db.query("select * from fets_live_push_queue('11111111-1111-4111-8111-111111111111')"), /permission denied/);
console.log('PASS: staff edits of fets.live candidates are queued (not walk-ins, not desk-filled slots, not number-only), queue reads name/phone/day/centre, a later edit keeps it waiting, service-only');
await db.close();
