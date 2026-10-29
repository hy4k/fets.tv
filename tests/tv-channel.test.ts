import assert from "node:assert/strict";
import test from "node:test";
import {
  TICKER_MAX,
  TODAY_SLIDE,
  adSound,
  cleanLink,
  fieldOf,
  lengthText,
  localNow,
  nextOn,
  playlist,
  scheduleLine,
  shortLink,
  slideStatus,
  tickerLines,
  tickerRun,
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

test("when a scheduled slide comes on", () => {
  // 03:30 on Tuesday 20 October in Kochi.
  const early = Date.parse("2026-10-19T22:00:00Z");
  const promo = slide({ starts_on: "2026-10-20", ends_on: "2026-10-31", from_time: "08:00:00", to_time: "21:00:00" });
  assert.equal(nextOn(promo, early, IST), "Comes on today at 8 AM");
  assert.equal(nextOn(slide({ starts_on: "2026-10-21", from_time: "09:30" }), early, IST), "Comes on tomorrow at 9:30 AM");
  assert.equal(nextOn(slide({ starts_on: "2026-10-24" }), early, IST), "Comes on Sat 24 Oct");
  assert.equal(nextOn(slide({ days: [6] }), early, IST), "Comes on Sat 24 Oct");
  assert.equal(nextOn(slide(), early, IST), null);
  assert.equal(nextOn(slide({ ends_on: "2026-10-19" }), early, IST), null);
  // Past today's hours: tomorrow.
  assert.equal(nextOn(slide({ from_time: "01:00", to_time: "02:00" }), early, IST), "Comes on tomorrow at 1 AM");
});

test("ticker lines never join the loop, and an ad needs its video", () => {
  const ticker = slide({ kind: "ticker", fields: { text: "Mock exams on Saturday" } });
  const ad = slide({ kind: "ad", media_url: "https://x/ad.mp4", media_kind: "video" });
  const noFile = slide({ kind: "ad" });
  const picture = slide({ kind: "ad", media_url: "https://x/a.png", media_kind: "image" });
  assert.deepEqual(playlist([ticker], TUE_1030, IST), []);
  assert.deepEqual(
    playlist([ticker, ad, noFile, picture], TUE_1030, IST).map((s) => s.id),
    [TODAY_SLIDE.id, ad.id],
  );
});

test("the ticker runs the lines on now, in the console's order", () => {
  const a = slide({ kind: "ticker", position: 2, fields: { text: "Second" } });
  const b = slide({ kind: "ticker", position: 1, fields: { text: "  First \n line  " } });
  const later = slide({ kind: "ticker", position: 0, fields: { text: "Weekends" }, days: [0, 6] });
  const off = slide({ kind: "ticker", position: 0, fields: { text: "Off" }, active: false });
  const blank = slide({ kind: "ticker", position: 3, fields: {} });
  const long = slide({ kind: "ticker", position: 4, fields: { text: "x".repeat(200) } });
  const promo = slide({ position: 0 });
  const lines = tickerLines([a, b, later, off, blank, long, promo], TUE_1030, IST);
  assert.deepEqual(lines.slice(0, 2), ["First line", "Second"]);
  assert.equal(lines.length, 3);
  assert.equal(lines[2].length, TICKER_MAX);
  assert.deepEqual(tickerLines([a], 0, IST), []);
  assert.deepEqual(tickerLines(null, TUE_1030, IST), []);
});

test("a short ticker repeats until it fills the strip, at a readable pace", () => {
  const short = tickerRun(["Hello"]);
  assert.ok(short.lines.length > 1 && short.lines.every((l) => l === "Hello"));
  assert.ok(short.lines.reduce((n, l) => n + l.length + 6, 0) >= 90);
  assert.ok(short.seconds >= 12);
  const long = tickerRun(["a".repeat(140), "b".repeat(140)]);
  assert.equal(long.lines.length, 2);
  assert.equal(long.seconds, Math.round(292 / 5));
  assert.deepEqual(tickerRun([]), { lines: [], seconds: 0 });
});

test("ads: sound is a choice, and they run to the end", () => {
  assert.equal(adSound({ fields: { sound: "on" } }), true);
  assert.equal(adSound({ fields: {} }), false);
  assert.equal(lengthText({ kind: "ad", seconds: 60 }), "plays to the end");
  assert.equal(lengthText({ kind: "ticker", seconds: 12 }), "scrolls along the bottom");
  assert.equal(lengthText({ kind: "promo", seconds: 15 }), "15s");
  // A ticker never shows the sample words in place of a missing line.
  assert.equal(fieldOf({ kind: "ticker", fields: {} }, "text"), "");
});
