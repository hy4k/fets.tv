import assert from "node:assert/strict";
import test from "node:test";
import { clockAt, instantFromZonedTime, nowInZone } from "../lib/format.ts";

const IST = "Asia/Kolkata";

test("a typed time is read in the center's timezone, not the laptop's", () => {
  // 09:30 IST on 2026-09-19 is 04:00 UTC — regardless of the host's own zone.
  const reference = new Date("2026-09-19T12:00:00Z");
  const instant = instantFromZonedTime("09:30", IST, reference);
  assert.equal(instant.toISOString(), "2026-09-19T04:00:00.000Z");
});

test("the instant round-trips back to the same wall clock", () => {
  const reference = new Date("2026-09-19T12:00:00Z");
  for (const hhmm of ["00:00", "05:29", "05:30", "09:30", "18:45", "23:59"]) {
    assert.equal(clockAt(instantFromZonedTime(hhmm, IST, reference).toISOString(), IST), hhmm);
  }
});

test("a zone whose date differs from UTC still lands on the center's day", () => {
  // 23:00 UTC is already the 20th in Kolkata, so 01:00 means the 20th there.
  const reference = new Date("2026-09-19T23:00:00Z");
  assert.equal(instantFromZonedTime("01:00", IST, reference).toISOString(), "2026-09-19T19:30:00.000Z");
});

test("it survives a DST boundary", () => {
  // London goes back one hour at 02:00 BST on 2026-10-25.
  const before = new Date("2026-10-24T12:00:00Z");
  assert.equal(
    instantFromZonedTime("09:00", "Europe/London", before).toISOString(),
    "2026-10-24T08:00:00.000Z",
  );
  const after = new Date("2026-10-26T12:00:00Z");
  assert.equal(
    instantFromZonedTime("09:00", "Europe/London", after).toISOString(),
    "2026-10-26T09:00:00.000Z",
  );
});

test("nowInZone reads as HH:MM", () => {
  assert.match(nowInZone(IST), /^([01]\d|2[0-3]):[0-5]\d$/);
});
