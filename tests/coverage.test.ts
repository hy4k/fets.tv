import assert from "node:assert/strict";
import test from "node:test";
import {
  coverageWeek,
  listDays,
  mondayOf,
  nextState,
  shiftWeeks,
  shortDays,
  thinDays,
} from "../lib/coverage.ts";
import type { StaffDay } from "../lib/types.ts";

// Wednesday 23 September 2026.
const NOW = new Date("2026-09-23T06:00:00Z").getTime();
const TZ = "Asia/Kolkata";

const STAFF = [
  { id: "aysha", name: "Aysha" },
  { id: "linofer", name: "Linofer" },
  { id: "lazeem", name: "Lazeem" },
];

const day = (profile: string, on_date: string, state: "off" | "half"): StaffDay => ({
  id: `${profile}-${on_date}`,
  center_id: "ct1",
  profile_id: profile,
  profile_name: profile,
  on_date,
  state,
  set_by: null,
  set_at: "2026-09-20T00:00:00Z",
  created_at: "2026-09-20T00:00:00Z",
});

const week = (staffDays: StaffDay[] = [], needs = 3, weekOf = "2026-09-23") =>
  coverageWeek({ staff: STAFF, staffDays, needs, timezone: TZ, weekOf, now: NOW });

test("a week runs Monday to Sunday whichever day you ask about", () => {
  for (const d of ["2026-09-21", "2026-09-23", "2026-09-27"]) {
    assert.equal(mondayOf(d), "2026-09-21");
  }

  const w = week();
  assert.equal(w.length, 7);
  assert.deepEqual(
    w.map((d) => d.weekday),
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  );
  assert.equal(w[0].date, "2026-09-21");
  assert.equal(w[6].date, "2026-09-27");
  assert.equal(w[0].dayOfMonth, 21);
});

test("everybody is in when nothing is recorded", () => {
  const w = week();
  for (const d of w) {
    assert.equal(d.inCount, 3);
    assert.equal(d.offCount, 0);
    assert.equal(d.tone, "ok");
    assert.deepEqual(d.states, { aysha: "in", linofer: "in", lazeem: "in" });
  }
  assert.deepEqual(shortDays(w), []);
});

test("one person off leaves the day short, and only that day", () => {
  const w = week([day("linofer", "2026-09-24", "off")]);

  const thu = w.find((d) => d.date === "2026-09-24")!;
  assert.equal(thu.inCount, 2);
  assert.equal(thu.offCount, 1);
  assert.equal(thu.tone, "short");
  assert.equal(thu.states.linofer, "off");

  const fri = w.find((d) => d.date === "2026-09-25")!;
  assert.equal(fri.inCount, 3);
  assert.equal(fri.tone, "ok");
});

test("a half day is thin, not short — there is a body, just not a whole day of one", () => {
  const w = week([day("lazeem", "2026-09-25", "half")]);
  const fri = w.find((d) => d.date === "2026-09-25")!;

  assert.equal(fri.inCount, 2);
  assert.equal(fri.halfCount, 1);
  assert.equal(fri.offCount, 0);
  assert.equal(fri.tone, "thin");
});

test("off plus half is short, because two people cannot hold three posts", () => {
  const w = week([day("lazeem", "2026-09-25", "half"), day("aysha", "2026-09-25", "off")]);
  const fri = w.find((d) => d.date === "2026-09-25")!;

  assert.equal(fri.inCount, 1);
  assert.equal(fri.halfCount, 1);
  assert.equal(fri.tone, "short");
});

test("what the day needs comes from the posts, so two posts forgive one absence", () => {
  const w = week([day("linofer", "2026-09-24", "off")], 2);
  assert.equal(w.find((d) => d.date === "2026-09-24")!.tone, "ok");
});

test("today is marked, and the days before it are past", () => {
  const w = week();
  assert.deepEqual(
    w.filter((d) => d.isToday).map((d) => d.date),
    ["2026-09-23"],
  );
  assert.deepEqual(
    w.filter((d) => d.isPast).map((d) => d.date),
    ["2026-09-21", "2026-09-22"],
  );
});

test("a day already gone is not something to warn about", () => {
  const w = week([
    day("linofer", "2026-09-21", "off"), // Monday, already past
    day("linofer", "2026-09-26", "off"), // Saturday, still to come
  ]);

  assert.equal(w[0].tone, "short");
  assert.deepEqual(
    shortDays(w).map((d) => d.date),
    ["2026-09-26"],
  );
});

test("rows for other weeks and orphaned rows are ignored", () => {
  const orphan: StaffDay = { ...day("aysha", "2026-09-24", "off"), profile_id: null };
  const w = week([orphan, day("aysha", "2026-10-01", "off")]);

  for (const d of w) assert.equal(d.tone, "ok");
});

test("paging moves by whole weeks in both directions", () => {
  assert.equal(shiftWeeks("2026-09-21", 1), "2026-09-28");
  assert.equal(shiftWeeks("2026-09-21", -1), "2026-09-14");
  // Across a month, and across a year.
  assert.equal(shiftWeeks("2026-09-28", 1), "2026-10-05");
  assert.equal(shiftWeeks("2026-12-28", 1), "2027-01-04");
});

test("the grid does not shift a day when the centre is ahead of UTC", () => {
  // 20:00 UTC on the 23rd is already the 24th in Calicut, so "today" there is
  // Thursday even though the server still says Wednesday.
  const late = new Date("2026-09-23T20:00:00Z").getTime();
  const w = coverageWeek({
    staff: STAFF,
    staffDays: [],
    needs: 3,
    timezone: TZ,
    weekOf: "2026-09-23",
    now: late,
  });

  assert.deepEqual(
    w.filter((d) => d.isToday).map((d) => d.date),
    ["2026-09-24"],
  );
  assert.equal(w.find((d) => d.date === "2026-09-23")!.isPast, true);
});

test("tapping cycles in, off, half, and back", () => {
  assert.equal(nextState("in"), "off");
  assert.equal(nextState("off"), "half");
  assert.equal(nextState("half"), "in");
});

test("thin and short are counted apart, because calling a half day short is untrue", () => {
  const w = week([
    day("linofer", "2026-09-24", "off"), // Thu: 2 of 3, nothing to make it up
    day("aysha", "2026-09-25", "half"), // Fri: 2 of 3 plus a half day
  ]);

  assert.deepEqual(
    shortDays(w).map((d) => d.date),
    ["2026-09-24"],
  );
  assert.deepEqual(
    thinDays(w).map((d) => d.date),
    ["2026-09-25"],
  );
});

test("days are listed the way somebody would say them", () => {
  const w = week([
    day("linofer", "2026-09-24", "off"),
    day("linofer", "2026-09-25", "off"),
    day("linofer", "2026-09-26", "off"),
  ]);

  assert.equal(listDays([]), "");
  assert.equal(listDays(shortDays(w).slice(0, 1)), "Thu 24");
  assert.equal(listDays(shortDays(w).slice(0, 2)), "Thu 24 and Fri 25");
  assert.equal(listDays(shortDays(w)), "Thu 24, Fri 25 and Sat 26");
});
