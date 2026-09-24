import assert from "node:assert/strict";
import test from "node:test";
import {
  countdown,
  dayBounds,
  handoverDue,
  minutesToShiftEnd,
  monitoringCsv,
  monitoringDay,
  type Check,
} from "../lib/monitoring.ts";

const T0 = Date.parse("2026-09-24T03:30:00Z"); // 09:00 in Kolkata
const min = (m: number) => T0 + m * 60000;
const iso = (m: number) => new Date(min(m)).toISOString();
const walk = (m: number, kind: Check["kind"] = "floor", who = "Aysha"): Check => ({
  kind,
  walked_at: iso(m),
  walked_by_name: who,
  note: null,
});
const day = (now: number, checks: Check[] = [], finishedAt: number | null = null) =>
  monitoringDay({ anchor: T0, finishedAt, now, checks, walkMinutes: 10, shiftMinutes: 90 });

test("nothing runs until the first exam clock starts", () => {
  assert.deepEqual(dayBounds([{ exam_started_at: null, exam_finished_at: null }]), {
    anchor: null,
    finishedAt: null,
  });
  const d = monitoringDay({ anchor: null, finishedAt: null, now: min(5), checks: [], walkMinutes: 10, shiftMinutes: 90 });
  assert.equal(d.shift, null);
  assert.equal(d.floor.current, null);
});

test("the day starts at the earliest exam start, and ends only when everyone has finished", () => {
  const b = dayBounds([
    { exam_started_at: iso(7), exam_finished_at: null },
    { exam_started_at: iso(0), exam_finished_at: iso(120) },
  ]);
  assert.equal(b.anchor, T0);
  assert.equal(b.finishedAt, null);
  const done = dayBounds([
    { exam_started_at: iso(7), exam_finished_at: iso(200) },
    { exam_started_at: iso(0), exam_finished_at: iso(120) },
  ]);
  assert.equal(done.finishedAt, min(200));
});

test("windows are cut from the exam start, and a check lands in the window it happened in", () => {
  const d = day(min(25), [walk(3), walk(21)]);
  assert.equal(d.floor.windows.length, 3);
  assert.deepEqual(
    d.floor.windows.map((w) => w.status),
    ["done", "missed", "done"],
  );
  assert.equal(d.floor.current?.n, 3);
  assert.equal(d.floor.current?.end, min(30));
});

test("the current window stays open until it ends, and then it is missed", () => {
  assert.equal(day(min(15)).floor.current?.status, "open");
  assert.equal(day(min(21)).floor.windows[1].status, "missed");
});

test("floor walks and DVR checks are separate logs on the same clock", () => {
  const d = day(min(12), [walk(2, "dvr"), walk(11, "floor")]);
  assert.deepEqual(d.floor.windows.map((w) => w.status), ["missed", "done"]);
  assert.deepEqual(d.dvr.windows.map((w) => w.status), ["done", "open"]);
});

test("shifts are ninety minutes from the exam start", () => {
  assert.deepEqual(day(min(89)).shift, { n: 1, start: T0, end: min(90) });
  assert.equal(day(min(90)).shift?.n, 2);
  assert.equal(day(min(95)).floor.current?.shift, 2);
});

test("the clock stops when the last candidate finishes", () => {
  const d = day(min(300), [], min(125));
  assert.equal(d.floor.windows.length, 13);
  assert.equal(d.floor.current, null);
  assert.ok(d.floor.windows.every((w) => w.status === "missed"));
});

test("no handover at the exam start; one is due near and after each ninety minutes", () => {
  const shiftMinutes = 90;
  assert.equal(handoverDue({ day: day(min(10)), now: min(10), lastRotation: min(-20), shiftMinutes }).due, false);
  assert.equal(handoverDue({ day: day(min(80)), now: min(80), lastRotation: min(-20), shiftMinutes }).due, false);
  const near = handoverDue({ day: day(min(86)), now: min(86), lastRotation: min(-20), shiftMinutes });
  assert.equal(near.due, true);
  assert.equal(near.boundary, min(90));
  assert.equal(near.minutes, 94);
  const late = handoverDue({ day: day(min(100)), now: min(100), lastRotation: min(-20), shiftMinutes });
  assert.equal(late.due, true);
  assert.equal(late.minutes, 80);
});

test("handing over a little early counts for that boundary, and the banner does not return", () => {
  const shiftMinutes = 90;
  assert.equal(handoverDue({ day: day(min(88)), now: min(88), lastRotation: min(87), shiftMinutes }).due, false);
  assert.equal(handoverDue({ day: day(min(93)), now: min(93), lastRotation: min(87), shiftMinutes }).due, false);
  assert.equal(handoverDue({ day: day(min(176)), now: min(176), lastRotation: min(87), shiftMinutes }).due, true);
});

test("nothing is due once the day has finished", () => {
  const d = day(min(200), [], min(150));
  assert.equal(handoverDue({ day: d, now: min(200), lastRotation: min(0), shiftMinutes: 90 }).due, false);
});

test("blocks started mid-shift end with the shift, within the database's limits", () => {
  assert.equal(minutesToShiftEnd(day(min(30)), min(30)), 60);
  assert.equal(minutesToShiftEnd(day(min(85)), min(85)), 15);
});

test("countdowns read as minutes and seconds, and past zero with a plus", () => {
  assert.equal(countdown(9 * 60000 + 5000), "9:05");
  assert.equal(countdown(-65000), "+1:05");
  assert.equal(countdown(3723000), "1:02:03");
});

test("the export has a row per window per track, names the holder, and cannot carry a formula", () => {
  const d = day(min(15), [
    { ...walk(4), note: "=HYPERLINK(1)" },
    walk(6, "dvr", "Lazeem"),
  ]);
  const csv = monitoringCsv({
    day: d,
    date: "2026-09-24",
    timezone: "Asia/Kolkata",
    blocks: [
      { post_kind: "lab", profile_name: "Aysha", started_at: iso(-30), ended_at: null },
      { post_kind: "cctv", profile_name: "Lazeem", started_at: iso(-30), ended_at: null },
    ],
  });
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 5);
  assert.match(lines[1], /"Floor walk","1","09:00-09:10","Aysha","Done","09:04","Aysha","'=HYPERLINK\(1\)"/);
  assert.match(lines[2], /"Floor walk","2","09:10-09:20","Aysha","Open"/);
  assert.match(lines[3], /"DVR","1","09:00-09:10","Lazeem","Done","09:06","Lazeem"/);
  assert.match(lines[1], /^"2026-09-24","1","09:00-10:30"/);
});

test("somebody still to start keeps the day open, however early the first finish", () => {
  const b = dayBounds([
    { exam_started_at: iso(0), exam_finished_at: iso(60), status: "signed_out" },
    { exam_started_at: null, exam_finished_at: null, status: "waiting" },
    { exam_started_at: null, exam_finished_at: null, status: "no_show" },
  ]);
  assert.equal(b.finishedAt, null);
  const over = dayBounds([
    { exam_started_at: iso(0), exam_finished_at: iso(60), status: "signed_out" },
    { exam_started_at: null, exam_finished_at: null, status: "no_show" },
  ]);
  assert.equal(over.finishedAt, min(60));
});

test("finishing exactly on a boundary does not open one more window", () => {
  assert.equal(day(min(200), [], min(90)).floor.windows.length, 9);
  assert.equal(day(min(200), [], min(91)).floor.windows.length, 10);
});
