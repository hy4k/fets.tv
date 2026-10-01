import assert from "node:assert/strict";
import test from "node:test";
import { dutyLogCsv, dutySpan, marks, nextMark, twoDigit } from "../lib/duty-timer.ts";

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
  assert.equal(lines[1], '"2026-09-24","DVR check","1","09:06","09:07","Aysha",""');
  assert.equal(lines[2], '"2026-09-24","DVR check","2","09:12","","",""');
  assert.equal(lines[3], `"2026-09-24","Floor walk","1","09:10","09:11","'=Rahul",""`);
});
