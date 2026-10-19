// Runs the TV Channel stats migration against a throwaway database.
// PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/verify-tv-channel-stats.mjs
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFileSync} from 'node:fs'; import assert from 'node:assert/strict';
const db = new PGlite();
const A = '11111111-1111-4111-8111-111111111111', B = '33333333-3333-4333-8333-333333333333';
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create type user_role as enum ('admin','tca','front_office','lab_staff','viewer');
create table centers(id uuid primary key,name text,timezone text);
insert into centers values('${A}','Calicut','Asia/Kolkata'),('${B}','Cochin','Asia/Kolkata');
create function current_center_id() returns uuid language sql as $$ select '${A}'::uuid $$;
create function fets_guard(p uuid, r user_role[]) returns void language sql as $$ select $$;
create publication supabase_realtime;`);
const run = (f) => db.exec(readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));
await run('20261020090000_fets_tv_channel.sql');
const save = async (center, slide) => (await db.query('select * from fets_save_slide($1,$2::jsonb)', [center, JSON.stringify(slide)])).rows[0];
// A slide made before the stats SQL gets a code from its id.
const old = await save(A, { kind: 'promo', link: 'https://fets.in/testdrive/' });
await run('20261020120000_fets_tv_channel_stats.sql');
await run('20261020120000_fets_tv_channel_stats.sql'); // twice is harmless
const oldCode = (await db.query('select code from display_slides where id=$1', [old.id])).rows[0].code;
assert.equal(oldCode, old.id.replace(/-/g, '').slice(0, 10));
const tip = await save(A, { kind: 'tip' });
assert.match(tip.code, /^[0-9a-f]{10}$/, 'new slides get a code');
const other = await save(B, { kind: 'tip' });
const shared = await save(B, { kind: 'promo', link: 'https://fets.in/x', everywhere: true });

const shown = async (center, counts) => (await db.query('select fets_count_shown($1,$2::jsonb) n', [center, JSON.stringify(counts)])).rows[0].n;
assert.equal(await shown(A, { [old.id]: 3, [tip.id]: '2', [other.id]: 5, [shared.id]: 1, junk: 4, [B]: 9 }), 3, 'only slides this centre plays');
assert.equal(await shown(A, { [old.id]: 2, [tip.id]: -4 }), 1);
assert.equal(await shown(A, { [tip.id]: 99999999 }), 0, 'absurd numbers ignored');
assert.equal(await shown(A, [1, 2]), 0);
const row = async (id) => (await db.query('select shown, scans from display_slide_stats where slide_id=$1', [id])).rows[0];
assert.deepEqual(await row(old.id), { shown: 5, scans: 0 });
assert.deepEqual(await row(tip.id), { shown: 2, scans: 0 });
assert.equal(await row(other.id), undefined);
assert.deepEqual(await row(shared.id), { shown: 1, scans: 0 });

const scan = async (code) => (await db.query('select fets_count_scan($1) link', [code])).rows[0].link;
assert.equal(await scan(oldCode), 'https://fets.in/testdrive/');
assert.equal(await scan(oldCode.toUpperCase()), 'https://fets.in/testdrive/');
assert.equal(await scan(tip.code), null, 'no link, nothing to send to');
assert.equal(await scan('nope'), null);
assert.deepEqual(await row(old.id), { shown: 5, scans: 2 });

// Deleting a slide takes its numbers with it.
await db.query('select fets_delete_slide($1,$2)', [A, tip.id]);
assert.equal(await row(tip.id), undefined);

await db.exec('set role authenticated');
await assert.rejects(db.query(`select fets_count_scan('${oldCode}')`), /permission denied/);
await assert.rejects(db.query(`select fets_count_shown('${A}','{}')`), /permission denied/);
console.log('PASS: every slide has a short code (old ones too); TVs count only slides their centre plays and ignore junk; scans count and return the link; numbers go with a deleted slide; counting is service-only');
await db.close();
