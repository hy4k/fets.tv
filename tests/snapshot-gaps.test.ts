import assert from "node:assert/strict";
import test from "node:test";
import { gapsAfterRefresh, type Gaps, type SnapshotTable } from "../lib/snapshot-gaps.ts";

const none: Gaps = { unread: [], stale: [] };

test("a load that succeeds is neither unread nor stale", () => {
  assert.deepEqual(gapsAfterRefresh(none, []), { unread: [], stale: [] });
});

test("a table read before and failing now is stale, not unread", () => {
  // The rows from before are still the best available, so they stay on screen.
  const after = gapsAfterRefresh(none, ["incidents"]);
  assert.deepEqual(after.unread, []);
  assert.deepEqual(after.stale, ["incidents"]);
});

test("a table never read stays unread while it keeps failing", () => {
  const prev: Gaps = { unread: ["staff_days"], stale: [] };
  const after = gapsAfterRefresh(prev, ["staff_days"]);
  assert.deepEqual(after.unread, ["staff_days"]);
  // And it is not also reported as stale: there is nothing from before to be
  // out of date, which is the whole difference between the two.
  assert.deepEqual(after.stale, []);
});

test("an unread table that finally arrives is clean, not stale", () => {
  const prev: Gaps = { unread: ["staff_days"], stale: [] };
  assert.deepEqual(gapsAfterRefresh(prev, []), { unread: [], stale: [] });
});

test("a stale table that recovers stops being stale", () => {
  const prev: Gaps = { unread: [], stale: ["candidates"] };
  assert.deepEqual(gapsAfterRefresh(prev, []), { unread: [], stale: [] });
});

test("a stale table that fails again is still stale, never promoted to unread", () => {
  const prev: Gaps = { unread: [], stale: ["candidates"] };
  const after = gapsAfterRefresh(prev, ["candidates"]);
  assert.deepEqual(after.unread, []);
  assert.deepEqual(after.stale, ["candidates"]);
});

test("the two states are tracked per table, not for the snapshot as a whole", () => {
  const prev: Gaps = { unread: ["profiles"], stale: [] };
  const after = gapsAfterRefresh(prev, ["profiles", "candidate_breaks"]);

  // profiles has still never arrived; breaks were there and now are not.
  assert.deepEqual(after.unread, ["profiles"]);
  assert.deepEqual(after.stale, ["candidate_breaks"]);
});

test("no table is ever in both lists at once", () => {
  const every: SnapshotTable[] = [
    "candidates",
    "incidents",
    "candidate_materials",
    "candidate_breaks",
    "staff_days",
    "duty_posts",
    "profiles",
  ];

  // Every combination of "was unread" and "failed now", for each table.
  for (const table of every) {
    for (const wasUnread of [true, false]) {
      for (const failedNow of [true, false]) {
        const after = gapsAfterRefresh(
          { unread: wasUnread ? [table] : [], stale: [] },
          failedNow ? [table] : [],
        );
        const both = after.unread.filter((t) => after.stale.includes(t));
        assert.deepEqual(both, [], `${table} unread=${wasUnread} failed=${failedNow}`);
      }
    }
  }
});
