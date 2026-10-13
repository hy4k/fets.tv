import assert from "node:assert/strict";
import test from "node:test";
import { seatName, seatNumber } from "../lib/seats.ts";

test("a seat is named by its desk number, never as a range", () => {
  assert.equal(seatNumber({ seat_code: "Lab 1-07" }), "7");
  assert.equal(seatName({ seat_code: "Lab 1-07", lab_name: "Lab 1" }), "Lab 1 · Seat 7");
});

test("a number set in Setup wins over the code", () => {
  assert.equal(seatName({ seat_code: "Lab 2-01", lab_name: "Lab 2", seat_label: "23" }), "Lab 2 · Seat 23");
  assert.equal(seatNumber({ seat_code: "Lab 2-01", seat_label: "  " }), "1");
});

test("a code without a number is shown as it is", () => {
  assert.equal(seatNumber({ seat_code: "Window" }), "Window");
});
