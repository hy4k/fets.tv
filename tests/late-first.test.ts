import assert from "node:assert/strict";
import test from "node:test";
import { joinedLate, lateFirst } from "../lib/format.ts";

const session = { created_at: "2026-09-30T03:00:00Z" };
const c = (id: string, created_at: string, status = "scheduled", roster_number = id) => ({
  id,
  created_at,
  status: status as "scheduled",
  roster_number,
});

test("a walk-in or a late booking counts as added late", () => {
  assert.equal(joinedLate(c("R1", "2026-09-30T03:00:20Z"), session), false);
  assert.equal(joinedLate(c("R2", "2026-09-30T05:10:00Z"), session), true);
  assert.equal(joinedLate(c("x", "2026-09-30T03:00:00Z", "scheduled", "MANUAL-004"), session), true);
});

test("late joiners waiting to check in go to the top, newest first", () => {
  const list = [
    c("A", "2026-09-30T03:00:05Z"),
    c("B", "2026-09-30T03:00:06Z"),
    c("W1", "2026-09-30T05:00:00Z"),
    c("W2", "2026-09-30T06:00:00Z"),
    c("W3", "2026-09-30T06:30:00Z", "testing"),
  ];
  assert.deepEqual(
    lateFirst(list, session).map((x) => x.id),
    ["W2", "W1", "A", "B", "W3"],
  );
});

test("once checked in, a late joiner takes their usual place", () => {
  const list = [c("A", "2026-09-30T03:00:05Z"), c("W1", "2026-09-30T05:00:00Z", "frisking")];
  assert.equal(lateFirst(list, session), list);
});
