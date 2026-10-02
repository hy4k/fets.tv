import assert from "node:assert/strict";
import test from "node:test";
import { dutyLogCsv, dutySpan, marks, nextMark, rotaOwnerAt, twoDigit, type DutyRota } from "../lib/duty-timer.ts";

const T0 = Date.parse("2026-09-24T03:30:00Z"); // 09:00 in Kolkata
const min = (m: number) => T0 + m * 60000;
const iso = (m: number) => new Date(min(m)).toISOString();

test("the run spans first start to last expected end, ignoring no-shows", () => {
  const span = dutySpan([
    { exam_started_at: iso(5), exam_expected_end: iso(125) },
    { exam_started_at: iso(0), exam_expected_end: iso(60) },
    { exam_started_at: null, exam_expected_end: null },
    { status: "no_show", exam_started_at: iso(-30), exam_expected_end: iso(400) },
  ]);
  assert.deepEqual(span, { start: min(0), end: min(125) });
  assert.deepEqual(dutySpan([{ exam_started_at: null, exam_expected_end: null }]), { start: null, end: null });
});

test("an end falls back to start plus duration", () => {
  const span = dutySpan([{ exam_started_at: iso(0), exam_expected_end: null, exam_duration_minutes: 90 }]);
  assert.equal(span.end, min(90));
});

test("marks every six and every ten minutes, up to the end", () => {
  assert.deepEqual(marks(min(0), min(30), 6), [min(6), min(12), min(18), min(24), min(30)]);
  assert.deepEqual(marks(min(0), min(25), 10), [min(10), min(20)]);
});

test("the next mark counts down and stops after the end", () => {
  assert.deepEqual(nextMark(min(0), min(30), 6, min(7)), { n: 2, at: min(12), left: 5 * 60000 });
  assert.equal(nextMark(min(0), min(30), 10, min(31)), null);
  assert.equal(twoDigit(5 * 60000 + 42000), "05:42");
  assert.equal(twoDigit(-1), "00:00");
});

test("the export lists every mark with the nearest check's name", () => {
  const csv = dutyLogCsv({
    start: min(0),
    end: min(12),
    checks: [
      { kind: "dvr", walked_at: iso(7), walked_by_name: "Aysha" },
      { kind: "floor", walked_at: iso(11), walked_by_name: "=Rahul" },
    ],
    date: "2026-09-24",
    timezone: "Asia/Kolkata",
  });
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 1 + 2 + 1);
  assert.equal(lines[0], '"Date","Track","Mark","Due at","On duty (rota)","Checked at","Checked by","Signature"');
  assert.equal(lines[1], '"2026-09-24","DVR check","1","09:06","","09:07","Aysha",""');
  assert.equal(lines[2], '"2026-09-24","DVR check","2","09:12","","","",""');
  assert.equal(lines[3], `"2026-09-24","Floor walk","1","09:10","","09:11","'=Rahul",""`);
});

// fets.live's plan: blocks from 08:00 (480) in 90-minute steps.
const rota: DutyRota = {
  blocks: [
    { start: 480, end: 570, owners: { floor: "a", control: "b" } },
    { start: 570, end: 660, owners: { floor: "b", control: "c" } },
  ],
  breaks: [{ staff: "c", cover: "a", start: 600, end: 615 }],
  changes: [{ block: 1, lane: "floor", staff_id: "d", starts: 630, ends: 640 }],
  names: { a: "Aysha", b: "Bindu", c: "Chris", d: "Deepa" },
};
const ist = (h: number, m: number) => Date.parse(`2026-09-24T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`);

test("the rota names the block owner: floor for walks, control for DVR", () => {
  assert.equal(rotaOwnerAt(rota, "floor", ist(8, 10)), "Aysha");
  assert.equal(rotaOwnerAt(rota, "dvr", ist(8, 12)), "Bindu");
  assert.equal(rotaOwnerAt(rota, "dvr", ist(9, 36)), "Chris");
});

test("a mark at a block's end belongs to that block, as in fets.live", () => {
  assert.equal(rotaOwnerAt(rota, "floor", ist(9, 30)), "Aysha");
  assert.equal(rotaOwnerAt(rota, "floor", ist(9, 31)), "Bindu");
});

test("break cover and cover arranged on the day replace the owner", () => {
  assert.equal(rotaOwnerAt(rota, "dvr", ist(10, 6)), "Aysha");
  assert.equal(rotaOwnerAt(rota, "dvr", ist(10, 18)), "Chris");
  assert.equal(rotaOwnerAt(rota, "floor", ist(10, 40)), "Deepa");
  assert.equal(rotaOwnerAt(rota, "floor", ist(10, 50)), "Bindu");
});

test("outside the rota's hours the name is blank", () => {
  assert.equal(rotaOwnerAt(rota, "floor", ist(7, 50)), "");
  assert.equal(rotaOwnerAt(rota, "floor", ist(11, 10)), "");
});

test("the export fills the on-duty column from the rota", () => {
  const csv = dutyLogCsv({ start: ist(8, 0), end: ist(8, 10), checks: [], date: "2026-09-24", timezone: "Asia/Kolkata", rota });
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[1], '"2026-09-24","DVR check","1","08:06","Bindu","","",""');
  assert.equal(lines[2], '"2026-09-24","Floor walk","1","08:10","Aysha","","",""');
});
