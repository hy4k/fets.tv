// Runs the Cochin merge against a throwaway database.
// PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/verify-cochin-floor-plan.mjs
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFileSync} from 'node:fs'; import assert from 'node:assert/strict';
const setup = (busy) => `create table centers(id uuid primary key,name text);
create table labs(id uuid primary key default gen_random_uuid(),center_id uuid,name text,position int,capacity int,unique(center_id,name),unique(center_id,position));
create table workstations(id uuid primary key default gen_random_uuid(),center_id uuid,lab_id uuid,lab_name text,seat_code text,seat_label text,status text default 'free',current_candidate_id uuid,unique(center_id,seat_code));
insert into centers values('22222222-2222-4222-8222-222222222222','Cochin'),('11111111-1111-4111-8111-111111111111','Calicut');
insert into labs(center_id,name,position,capacity) values('22222222-2222-4222-8222-222222222222','Lab 1',1,22),('22222222-2222-4222-8222-222222222222','Lab 2',2,8),('11111111-1111-4111-8111-111111111111','Lab 1',1,40);
insert into workstations(center_id,lab_id,lab_name,seat_code,status) select l.center_id,l.id,l.name,l.name||'-'||lpad(g::text,2,'0'),case when ${busy} and g=2 then 'active' else 'free' end from labs l, generate_series(1,l.capacity) g;`;
const sql = readFileSync(new URL('../supabase/migrations/20261019100000_fets_cochin_floor_plan.sql', import.meta.url), 'utf8');
const db = new PGlite(); await db.exec(setup(false));
const lab2seat3 = (await db.query("select w.id from workstations w join labs l on l.id=w.lab_id where l.name='Lab 2' and w.seat_code='Lab 2-03'")).rows[0].id;
await db.exec(sql);
const labs = (await db.query("select * from labs where center_id='22222222-2222-4222-8222-222222222222'")).rows;
assert.equal(labs.length, 1); assert.equal(labs[0].name, 'Exam Hall'); assert.equal(labs[0].capacity, 31);
const seats = (await db.query("select * from workstations where lab_id=$1 order by seat_code", [labs[0].id])).rows;
assert.equal(seats.length, 31); assert.equal(seats[0].seat_code, 'Exam Hall-01'); assert.equal(seats[30].seat_code, 'Exam Hall-31');
assert.equal(seats.find(s => s.id === lab2seat3).seat_code, 'Exam Hall-25');
const plan = labs[0].plan; assert.equal(Object.keys(plan.seats).length, 31);
// Seat 25 is the right wall's fourth desk; seat 9 tops the island's left side.
assert.deepEqual(plan.seats[lab2seat3], { x: 5, y: 3, f: 'right' });
assert.deepEqual(plan.seats[seats[8].id], { x: 2, y: 0, f: 'right' });
const cells = new Set(Object.values(plan.seats).map(s => `${s.x},${s.y}`)); assert.equal(cells.size, 31);
assert.equal((await db.query("select count(*)::int n from labs where center_id='11111111-1111-4111-8111-111111111111' and name='Lab 1'")).rows[0].n, 1);
await db.exec(sql); // second run: skipped
const busy = new PGlite(); await busy.exec(setup(true)); await assert.rejects(busy.exec(sql), /in use/);
console.log('PASS: Cochin merged into one 31-seat Exam Hall with ids kept, seat 31 added, drawn plan, Calicut untouched, rerun no-op, refuses while seated');
await db.close(); await busy.close();
