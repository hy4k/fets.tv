import assert from "node:assert/strict";
import test from "node:test";
import { CPR_FORMATS, clock12, entryText, minutesLate, writeEntry } from "../lib/cpr.ts";

const f = (key: string) => CPR_FORMATS.find((x) => x.key === key)!;

test("clock times read the way the reports write them", () => {
  assert.equal(clock12("09:45"), "09:45 AM");
  assert.equal(clock12("13:05"), "01:05 PM");
  assert.equal(clock12("00:10"), "12:10 AM");
  assert.equal(clock12("12:00"), "12:00 PM");
  assert.equal(clock12("soon"), "soon");
});

test("late arrival, able to test, in the centre's words", () => {
  const e = writeEntry(f("late_able"), { arrived: "09:45", scheduled: "09:00", late: "45" });
  assert.equal(
    e.additional,
    "At 09:45 AM, the candidate arrived for their scheduled 09:00 AM exam appointment. The candidate arrived 45 minutes late.",
  );
  assert.match(e.resolution, /permitted to test per client practice\.$/);
});

test("late arrival, unable to test, says the grace period was exceeded", () => {
  const e = writeEntry(f("late_unable"), { arrived: "10:15", scheduled: "09:00", late: "75" });
  assert.match(e.additional, /75 minutes late, exceeding the allowable grace period/);
  assert.match(e.resolution, /not permitted to test/);
});

test("a blank field shows a placeholder, not an empty gap", () => {
  const e = writeEntry(f("power_failure"), { at: "13:45" });
  assert.match(e.additional, /At 01:45 PM/);
  assert.match(e.additional, /A total of \[number\] candidates/);
  assert.match(e.resolution, /Power was restored at \[time\]\./);
});

test("text fields keep their sensible default", () => {
  const e = writeEntry(f("missing_id"), { at: "08:30", scheduled: "09:00" });
  assert.match(e.additional, /presented a driver's license that was expired\./);
});

test("the pasted entry has the title and both headings", () => {
  const text = entryText(f("dvr_check"), {});
  assert.match(text, /^DVR CHECK :\n\nAdditional Information : During routine monitoring/);
  assert.match(text, /\n\nResolution : Verified DVR functionality/);
});

test("minutes late only counts a real, late arrival", () => {
  assert.equal(minutesLate("2026-09-29T03:30:00Z", "2026-09-29T04:15:00Z"), 45);
  assert.equal(minutesLate("2026-09-29T03:30:00Z", "2026-09-29T03:20:00Z"), null);
  assert.equal(minutesLate(null, "2026-09-29T03:20:00Z"), null);
});

test("every format writes both paragraphs with nothing filled in", () => {
  for (const format of CPR_FORMATS) {
    const e = writeEntry(format, {});
    assert.ok(e.additional.length > 20, format.key);
    assert.ok(e.resolution.length > 20, format.key);
    assert.doesNotMatch(e.additional + e.resolution, /undefined/, format.key);
  }
});
