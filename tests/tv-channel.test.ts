import assert from "node:assert/strict";
import test from "node:test";
import {
  TODAY_SLIDE,
  cleanLink,
  fieldOf,
  localNow,
  playlist,
  scheduleLine,
  shortLink,
  slideStatus,
  type TvSlide,
} from "../lib/tv-channel.ts";

const IST = "Asia/Kolkata";
// Tuesday 20 October 2026, 10:30 in Kochi.
const TUE_1030 = Date.parse("2026-10-20T05:00:00Z");

let n = 0;
const slide = (over: Partial<TvSlide> = {}): TvSlide => ({
  id: `s${++n}`,
  center_id: "c",
  kind: "promo",
  label: "",
  fields: {},
  link: null,
  media_path: null,
  media_kind: null,
  seconds: 12,
  starts_on: null,
  ends_on: null,
  days: [0, 1, 2, 3, 4, 5, 6],
  from_time: null,
  to_time: null,
  everywhere: false,
  position: n,
  active: true,
  ...over,
});

test("the centre's own date, day and time", () => {
  assert.deepEqual(localNow(TUE_1030, IST), { date: "2026-10-20", day: 2, minutes: 630 });
});

test("dates, days and hours decide whether a slide is on", () => {
  assert.equal(slideStatus(slide(), TUE_1030, IST), "on");
  assert.equal(slideStatus(slide({ active: false }), TUE_1030, IST), "off");
  assert.equal(slideStatus(slide({ ends_on: "2026-10-19" }), TUE_1030, IST), "ended");
  assert.equal(slideStatus(slide({ ends_on: "2026-10-20" }), TUE_1030, IST), "on");
  assert.equal(slideStatus(slide({ starts_on: "2026-10-21" }), TUE_1030, IST), "later");
  assert.equal(slideStatus(slide({ days: [0, 6] }), TUE_1030, IST), "later");
  assert.equal(slideStatus(slide({ from_time: "09:00", to_time: "13:00" }), TUE_1030, IST), "on");
  assert.equal(slideStatus(slide({ from_time: "11:00:00", to_time: "13:00:00" }), TUE_1030, IST), "later");
  assert.equal(slideStatus(slide({ from_time: "08:00", to_time: "10:30" }), TUE_1030, IST), "later");
  // A window across midnight.
  assert.equal(slideStatus(slide({ from_time: "20:00", to_time: "11:00" }), TUE_1030, IST), "on");
  assert.equal(slideStatus(slide({ from_time: "11:00" }), TUE_1030, IST), "later");
  assert.equal(slideStatus(slide({ to_time: "10:00" }), TUE_1030, IST), "later");
});

test("an empty or home-only playlist leaves the home screen as it was", () => {
  assert.deepEqual(playlist([], TUE_1030, IST), []);
  assert.deepEqual(playlist(null, TUE_1030, IST), []);
  assert.deepEqual(playlist([slide({ active: false })], TUE_1030, IST), []);
  assert.deepEqual(playlist([slide({ kind: "today" })], TUE_1030, IST), []);
  // Before the clock is known nothing plays.
  assert.deepEqual(playlist([slide()], 0, IST), []);
});

test("the home screen keeps a turn unless the centre placed it", () => {
  const a = slide({ position: 2 });
  const b = slide({ position: 1, kind: "tip" });
  assert.deepEqual(
    playlist([a, b], TUE_1030, IST).map((s) => s.id),
    [TODAY_SLIDE.id, b.id, a.id],
  );
  const home = slide({ kind: "today", position: 3 });
  assert.deepEqual(
    playlist([a, home, b], TUE_1030, IST).map((s) => s.id),
    [b.id, a.id, home.id],
  );
});

test("a poster with nothing to show is skipped", () => {
  const empty = slide({ kind: "poster" });
  const pic = slide({ kind: "poster", media_url: "https://x/y.png", media_kind: "image" });
  assert.deepEqual(
    playlist([empty, pic], TUE_1030, IST).map((s) => s.id),
    [TODAY_SLIDE.id, pic.id],
  );
});

test("empty boxes fall back to the design's own words", () => {
  assert.equal(fieldOf(slide({ fields: { title: "  " } }), "title"), "CMA US Mock Exam");
  assert.equal(fieldOf(slide({ fields: { title: "ACCA Mock" } }), "title"), "ACCA Mock");
  assert.equal(fieldOf(slide({ kind: "poster" }), "caption"), "");
});

test("links for the QR code", () => {
  assert.equal(cleanLink("https://fets.in/testdrive/"), "https://fets.in/testdrive/");
  assert.equal(cleanLink("fets.in/testdrive"), "https://fets.in/testdrive");
  assert.equal(cleanLink("javascript:alert(1)"), null);
  assert.equal(cleanLink("  "), null);
  assert.equal(shortLink("https://www.fets.in/testdrive/"), "fets.in/testdrive");
});

test("the schedule in a line", () => {
  assert.equal(scheduleLine(slide()), "Daily · all day");
  assert.equal(
    scheduleLine(slide({ days: [1, 2, 3, 4, 5], from_time: "09:00:00", to_time: "13:30:00", ends_on: "2026-10-31" })),
    "Mon–Fri · 9 AM–1:30 PM · until 31 Oct",
  );
  assert.equal(scheduleLine(slide({ days: [6, 0] })), "Weekends · all day");
});
