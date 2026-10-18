import assert from "node:assert/strict";
import test from "node:test";
import { autoPlan, completePlan, nextFacing, occupant, readPlan, turnPlan } from "../lib/floor-plan.ts";

test("a lab nobody has drawn is laid out in rows of eight", () => {
  const p = autoPlan(Array.from({ length: 10 }, (_, i) => `s${i + 1}`));
  assert.equal(p.w, 8);
  assert.equal(p.h, 2);
  assert.deepEqual(p.seats.s9, { x: 0, y: 1, f: "up" });
});

test("a stored plan is read defensively", () => {
  assert.equal(readPlan(null), null);
  assert.equal(readPlan({ w: 0, h: 3 }), null);
  const p = readPlan({
    w: 4,
    h: 3,
    seats: { a: { x: 1, y: 2, f: "left" }, b: { x: 9, y: 0, f: "up" }, c: { x: 0, y: 0, f: "sideways" } },
    items: [{ k: "label", x: 2, y: 0, w: 5, h: 1, t: "Test Station" }, { k: "chair", x: 0, y: 0, w: 1, h: 1 }],
  })!;
  assert.deepEqual(Object.keys(p.seats).sort(), ["a", "c"]);
  assert.equal(p.seats.c.f, "up");
  assert.deepEqual(p.items, [{ k: "label", x: 2, y: 0, w: 2, h: 1, t: "Test Station" }]);
});

test("seats added after drawing go on a row below; removed seats drop off", () => {
  const p = completePlan({ w: 3, h: 2, seats: { a: { x: 0, y: 0, f: "up" }, gone: { x: 1, y: 0, f: "up" } }, items: [] }, ["a", "n1", "n2"]);
  assert.equal(p.seats.gone, undefined);
  assert.deepEqual(p.seats.n1, { x: 0, y: 3, f: "up" });
  assert.deepEqual(p.seats.n2, { x: 1, y: 3, f: "up" });
  assert.equal(p.h, 4);
});

test("turning puts the top of the drawing on the left, and turns each seat", () => {
  // 4 wide, 13 tall: Calicut's Test Station 2.
  const p = turnPlan({
    w: 4,
    h: 13,
    seats: { wall: { x: 0, y: 1, f: "left" }, island: { x: 3, y: 0, f: "left" } },
    items: [{ k: "label", x: 2, y: 12, w: 2, h: 1, t: "Test Station" }],
  });
  assert.equal(p.w, 13);
  assert.equal(p.h, 4);
  assert.deepEqual(p.seats.wall, { x: 1, y: 3, f: "down" });
  assert.deepEqual(p.seats.island, { x: 0, y: 0, f: "down" });
  assert.deepEqual(p.items[0], { k: "label", x: 12, y: 0, w: 1, h: 2, t: "Test Station" });
});

test("facing cycles, and a cell knows who stands in it", () => {
  assert.equal(nextFacing("left"), "up");
  const p = autoPlan(["a", "b"]);
  assert.equal(occupant(p, 1, 0), "b");
  assert.equal(occupant(p, 1, 0, "b"), null);
});
