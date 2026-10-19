// Runs the TV Channel migration against a throwaway database.
// PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/verify-tv-channel.mjs
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFileSync} from 'node:fs'; import assert from 'node:assert/strict';
const db = new PGlite();
const A = '11111111-1111-4111-8111-111111111111', B = '33333333-3333-4333-8333-333333333333';
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create type user_role as enum ('admin','tca','front_office','lab_staff','viewer');
create table centers(id uuid primary key,name text);
insert into centers values('${A}','Calicut'),('${B}','Cochin');
create function current_center_id() returns uuid language sql as $$ select '${A}'::uuid $$;
create function fets_guard(p uuid, r user_role[]) returns void language sql as $$ select $$;
create publication supabase_realtime;`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261020090000_fets_tv_channel.sql', import.meta.url), 'utf8'));
// Running it twice is harmless.
await db.exec(readFileSync(new URL('../supabase/migrations/20261020090000_fets_tv_channel.sql', import.meta.url), 'utf8'));
const save = async (center, slide) => (await db.query('select * from fets_save_slide($1,$2::jsonb)', [center, JSON.stringify(slide)])).rows[0];

const promo = await save(A, { kind: 'promo', label: 'CMA mock', fields: { title: ' CMA US Mock ', price: '', when: 'Sat' }, link: 'https://fets.in/testdrive/', seconds: 15, days: [6, 0, 6], from_time: '09:00', to_time: '13:00', ends_on: '2026-10-31' });
assert.deepEqual(promo.fields, { title: 'CMA US Mock', when: 'Sat' }, 'trimmed, empty boxes dropped');
assert.deepEqual(promo.days, [0, 6]); assert.equal(promo.position, 1); assert.equal(promo.active, true);
const tip = await save(A, { kind: 'tip', fields: { text: 'Breathe.' } });
assert.equal(tip.position, 2); assert.deepEqual(tip.days, [0, 1, 2, 3, 4, 5, 6]); assert.equal(tip.seconds, 12);

// Edit, switch off, order, delete.
const edited = await save(A, { ...promo, id: promo.id, fields: { title: 'ACCA Mock' }, active: false, days: [1] });
assert.equal(edited.id, promo.id); assert.equal(edited.active, false); assert.deepEqual(edited.fields, { title: 'ACCA Mock' });
await db.query('select fets_order_slides($1,$2)', [A, [tip.id, promo.id]]);
assert.deepEqual((await db.query('select id from display_slides order by position')).rows.map(r => r.id), [tip.id, promo.id]);

// What it refuses.
const refuses = async (center, slide, re) => assert.rejects(save(center, slide), re);
await refuses(A, { kind: 'banner' }, /unknown slide design/);
await refuses(A, { kind: 'promo', link: 'javascript:alert(1)' }, /web link/);
await refuses(A, { kind: 'promo', fields: { title: 'x'.repeat(201) } }, /too long/);
await refuses(A, { kind: 'promo', seconds: 2 }, /between 5 and 60/);
await refuses(A, { kind: 'promo', days: [] }, /at least one day/);
await refuses(A, { kind: 'poster', media_path: `${B}/slides/x.png`, media_kind: 'image' }, /another centre/);
await refuses(A, { kind: 'poster', media_path: `${A}/slides/x.pdf`, media_kind: 'file' }, /image or a video/);
await refuses(A, { kind: 'promo', starts_on: '2026-11-02', ends_on: '2026-11-01' }, /check constraint/);
await refuses(B, { ...tip, id: tip.id }, /another centre/);
const poster = await save(A, { kind: 'poster', media_path: `${A}/slides/x.mp4`, media_kind: 'video', everywhere: true });
assert.equal(poster.media_kind, 'video'); assert.equal(poster.everywhere, true);

await db.query('select fets_delete_slide($1,$2)', [B, tip.id]);
assert.equal((await db.query('select count(*)::int n from display_slides')).rows[0].n, 3, 'another centre cannot delete it');
await db.query('select fets_delete_slide($1,$2)', [A, tip.id]);
assert.equal((await db.query('select count(*)::int n from display_slides')).rows[0].n, 2);

assert.equal((await db.query("select count(*)::int n from pg_publication_tables where tablename='display_slides'")).rows[0].n, 1);
await db.exec('set role anon');
await assert.rejects(db.query(`select fets_save_slide('${A}','{"kind":"tip"}')`), /permission denied/);
console.log('PASS: slides are added, edited, switched off, ordered and deleted per centre; words trimmed and bounded, links web-only, files only from the centre\'s folder, schedule checked; realtime on; anon refused');
await db.close();
