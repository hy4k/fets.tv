import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileRoster } from '../lib/roster-reconcile.ts';
const row = { full_name: 'One Whole Name', phone: null, roster_number: '00123', exam_part: 'Part 1', exam_start_time: '09:00:00', client_name: 'PROMETRIC', exam_name: 'CMA US', status: 'registered' };
const slot = { client_name: 'PROMETRIC', exam_name: 'CMA US', start_time: '09:00:00', end_time: '13:00:00', candidate_count: 1 };
test('keeps whole name and leading zeros, checks counts by slot', () => {
 const result = reconcileRoster([row], [slot]); assert.equal(result.issues.length, 0); assert.equal(result.rows[0].full_name, 'One Whole Name'); assert.equal(result.rows[0].roster_number, '00123');
 assert.equal(reconcileRoster([row], [{...slot,candidate_count:2}]).issues.length, 1);
});
test('missing IDs and missing times block the pull rather than disappear', () => {
 assert.equal(reconcileRoster([{...row,roster_number:null}], [slot]).issues.length,1);
 assert.equal(reconcileRoster([{...row,exam_start_time:null}], [slot]).issues.length,1);
});
test('provider IDs can overlap; duplicate IDs within a provider cannot', () => {
 assert.equal(reconcileRoster([row,{...row,client_name:'CELPIP'}], [slot,{...slot,client_name:'CELPIP'}]).issues.length,0);
 assert.ok(reconcileRoster([row,row], [{...slot,candidate_count:2}]).issues.some(i=>i.includes('duplicates')));
});
test('calendar-only bookings are reported, never turned into invented candidates', () => {
 const result = reconcileRoster([], [slot]);assert.equal(result.rows.length,0);assert.equal(result.warnings.length,1);
});
