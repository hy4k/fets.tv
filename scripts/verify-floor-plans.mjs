// Runs the floor-plan migration against a throwaway database: the Calicut
// split, the drawn plans, and fets_save_lab_plan's checks.
// PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/verify-floor-plans.mjs
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFileSync} from 'node:fs'; import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create type user_role as enum('admin','tca','front_office','lab_staff','viewer');
create table centers(id uuid primary key,name text);
create table labs(id uuid primary key default gen_random_uuid(),center_id uuid,name text,position int,capacity int,unique(center_id,name),unique(center_id,position));
create table workstations(id uuid primary key default gen_random_uuid(),center_id uuid,lab_id uuid,lab_name text,seat_code text,seat_label text,status text default 'free',current_candidate_id uuid,unique(center_id,seat_code));
create function fets_guard(p uuid, r user_role[]) returns void language sql as 'select';
insert into centers values('11111111-1111-4111-8111-111111111111','Calicut'),('22222222-2222-4222-8222-222222222222','Cochin');
insert into labs(center_id,name,position,capacity) values('11111111-1111-4111-8111-111111111111','Lab 1',1,40),('22222222-2222-4222-8222-222222222222','Lab 1',1,22);
insert into workstations(center_id,lab_id,lab_name,seat_code,seat_label) select l.center_id,l.id,l.name,'Lab 1-'||lpad(g::text,2,'0'),case when g=7 then '99' end from labs l, generate_series(1,l.capacity) g;`);
const sql=readFileSync(new URL('../supabase/migrations/20261019090000_fets_floor_plans.sql',import.meta.url),'utf8');
const keep=(await db.query("select id from workstations where seat_code='Lab 1-15' and center_id='11111111-1111-4111-8111-111111111111'")).rows[0].id;
await db.exec(sql);
const labs=(await db.query("select name,position,capacity,plan from labs where center_id='11111111-1111-4111-8111-111111111111' order by position")).rows;
assert.deepEqual(labs.map(l=>[l.name,l.position,l.capacity]),[['Test Station 1',1,10],['Test Station 2',2,30]]);
assert.equal(Object.keys(labs[0].plan.seats).length,10);
assert.equal(Object.keys(labs[1].plan.seats).length,30);
const moved=(await db.query('select * from workstations where id=$1',[keep])).rows[0];
assert.equal(moved.seat_code,'Test Station 2-05'); assert.equal(moved.lab_name,'Test Station 2');
// Old seat 15 is now Test Station 2 seat 5: on the left wall, row 7.
assert.deepEqual(labs[1].plan.seats[keep],{x:0,y:7,f:'left'});
assert.equal((await db.query("select count(*)::int n from workstations where seat_label is not null and center_id='11111111-1111-4111-8111-111111111111'")).rows[0].n,0);
// Cochin untouched.
assert.equal((await db.query("select count(*)::int n from labs where center_id='22222222-2222-4222-8222-222222222222' and plan is null")).rows[0].n,1);
// Running it again is a no-op.
await db.exec(sql);
// Saving a plan.
const lab=(await db.query("select id from labs where name='Test Station 1'")).rows[0].id;
const seat=(await db.query("select id from workstations where seat_code='Test Station 1-01'")).rows[0].id;
const other=(await db.query("select id from workstations where seat_code='Test Station 2-01'")).rows[0].id;
const save=(plan)=>db.query('select fets_save_lab_plan($1,$2::jsonb)',[lab,plan===null?null:JSON.stringify(plan)]);
await save({w:5,h:5,seats:{[seat]:{x:4,y:4,f:'up'}},items:[]});
await assert.rejects(save({w:5,h:5,seats:{[other]:{x:0,y:0,f:'up'}},items:[]}),/not in this lab/);
await assert.rejects(save({w:5,h:5,seats:{[seat]:{x:5,y:0,f:'up'}},items:[]}),/off the grid/);
await assert.rejects(save({w:0,h:5,seats:{},items:[]}),/1 to 60/);
await save(null); assert.equal((await db.query('select plan from labs where id=$1',[lab])).rows[0].plan,null);
// Refuses while somebody is seated.
const db2=new PGlite();
await db2.exec(`create role anon;create role authenticated;create type user_role as enum('admin');create table centers(id uuid primary key,name text);create table labs(id uuid primary key default gen_random_uuid(),center_id uuid,name text,position int,capacity int,unique(center_id,name),unique(center_id,position));create table workstations(id uuid primary key default gen_random_uuid(),center_id uuid,lab_id uuid,lab_name text,seat_code text,seat_label text,status text default 'free',current_candidate_id uuid);create function fets_guard(p uuid, r user_role[]) returns void language sql as 'select';insert into centers values('11111111-1111-4111-8111-111111111111','Calicut');insert into labs(center_id,name,position,capacity) values('11111111-1111-4111-8111-111111111111','Lab 1',1,40);insert into workstations(center_id,lab_id,lab_name,seat_code,status) select l.center_id,l.id,l.name,'Lab 1-'||lpad(g::text,2,'0'),case when g=3 then 'active' else 'free' end from labs l, generate_series(1,40) g;`);
await assert.rejects(db2.exec(sql),/in use/);
console.log('PASS: Calicut split into Test Station 1 (10) and 2 (30) with drawn plans, ids kept, numbers reset, Cochin untouched, rerun no-op, plan save checks, refuses while seated');
await db.close(); await db2.close();
