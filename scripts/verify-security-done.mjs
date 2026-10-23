// Runs the one-tick security migration against a throwaway database.
// PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/verify-security-done.mjs
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFileSync} from 'node:fs'; import assert from 'node:assert/strict';
const db = new PGlite();
const A = '11111111-1111-4111-8111-111111111111', B = '33333333-3333-4333-8333-333333333333';
await db.exec(`create role anon;create role authenticated;
create type user_role as enum ('admin','tca','front_office','lab_staff','viewer');
create type candidate_stage as enum ('scheduled','arrived','id_checked','waiting','frisking','biometrics','assigned','lab_entry','testing','completed','signed_out','no_show');
create table candidates(id uuid primary key, center_id uuid, status candidate_stage, called_at timestamptz, frisked_at timestamptz, biometrics_at timestamptz, workstation_id uuid);
create table public_display_calls(id serial, center_id uuid, candidate_id uuid, active boolean);
create table events(candidate uuid, type text, f candidate_stage, t candidate_stage);
create function fets_guard(p uuid, r user_role[]) returns void language sql as $$ select $$;
create function fets_log_event(c uuid, ce uuid, ty text, f candidate_stage, t candidate_stage, n text default null, m jsonb default '{}') returns void language sql as $$ insert into events values (c, ty, f, t) $$;
insert into candidates values
 ('aaaaaaaa-0000-4000-8000-000000000001','${A}','waiting',now(),null,null,null),
 ('aaaaaaaa-0000-4000-8000-000000000002','${A}','waiting',null,null,null,null),
 ('aaaaaaaa-0000-4000-8000-000000000003','${A}','frisking',null,now() - interval '5 min',null,null),
 ('aaaaaaaa-0000-4000-8000-000000000004','${A}','testing',null,null,null,null);
insert into public_display_calls(center_id,candidate_id,active) values ('${A}','aaaaaaaa-0000-4000-8000-000000000001',true);`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261023090000_fets_security_done.sql', import.meta.url), 'utf8'));
const tick = (center, n) => db.query(`select * from fets_security_done($1, 'aaaaaaaa-0000-4000-8000-00000000000${n}')`, [center]);
const one = (await tick(A, 1)).rows[0];
assert.equal(one.status, 'assigned'); assert.equal(one.called_at, null); assert.ok(one.frisked_at && one.biometrics_at);
assert.equal((await db.query('select count(*)::int n from public_display_calls where active')).rows[0].n, 0, 'name off the TV');
await assert.rejects(tick(A, 2), /only somebody who has been called/);
const three = (await tick(A, 3)).rows[0];
assert.equal(three.status, 'assigned'); assert.ok(three.biometrics_at);
assert.ok(new Date(three.frisked_at) < new Date(three.biometrics_at), 'an earlier frisk time is kept');
await assert.rejects(tick(A, 4), /only somebody who has been called/);
await assert.rejects(tick(B, 1), /not found at this centre/);
assert.deepEqual((await db.query('select type, f, t from events order by f')).rows.map(r => `${r.f}>${r.t}`), ['waiting>assigned', 'frisking>assigned']);
await db.exec('set role anon');
await assert.rejects(db.query(`select fets_security_done('${A}','aaaaaaaa-0000-4000-8000-000000000001')`), /permission denied/);
console.log('PASS: a called candidate (or one half-way under the old flow) goes to ready-for-a-seat in one tick, both times stamped, name off the TV, logged; not-called, seated and other-centre refused; anon refused');
await db.close();
