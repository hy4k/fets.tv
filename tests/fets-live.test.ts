import assert from "node:assert/strict";
import test from "node:test";
import { branchOf, isSecretKey, providerOf, summariseDay, type CalendarRow } from "../lib/fets-live.ts";

const row = (client: string, exam: string, count: number, start: string, end: string | null): CalendarRow => ({
  client_name: client,
  exam_name: exam,
  candidate_count: count,
  start_time: start,
  end_time: end,
});

test("providers follow fets.live's client names", () => {
  assert.equal(providerOf("PROMETRIC", "CMA US Part 1"), "Prometric");
  assert.equal(providerOf("PEARSON VUE", "AWS"), "Pearson VUE");
  assert.equal(providerOf("CELPIP", "CELPIP General"), "CELPIP");
  assert.equal(providerOf("PSI", "Something"), "PSI");
  assert.equal(providerOf("ITTS", "Something"), "ITTS");
});

test("older rows with the exam in client_name fall back on the exam", () => {
  assert.equal(providerOf("CMA US", "CMA US"), "Prometric");
  assert.equal(providerOf("CELPIP General", "CELPIP General"), "CELPIP");
  assert.equal(providerOf("IELTS", "IELTS"), null);
  // "PSI" inside another word is not PSI.
  assert.equal(providerOf("PSYCHOMETRIC", "PSYCHOMETRIC"), null);
});

test("centres map to fets.live branches", () => {
  assert.equal(branchOf("FETS Calicut"), "calicut");
  assert.equal(branchOf("FETS Cochin"), "cochin");
  assert.equal(branchOf("Somewhere"), null);
});

test("a provider's day: count, exams and hours", () => {
  const rows = [
    row("PROMETRIC", "CMA US Part 1", 6, "09:00", "13:00"),
    row("PROMETRIC", "CMA US Part 2", 4, "13:30:00", "17:30:00"),
    row("PROMETRIC", "CMA US Part 1", 2, "08:30", "12:30"),
    row("CELPIP", "CELPIP General", 9, "09:00", "12:00"),
  ];
  const day = summariseDay(rows, "Prometric", "2026-09-29");
  assert.ok(day.connected);
  assert.equal(day.count, 12);
  assert.deepEqual(
    day.exams.map((e) => [e.name, e.count]),
    [
      ["CMA US Part 1", 8],
      ["CMA US Part 2", 4],
    ],
  );
  assert.equal(day.exams[0].start, "2026-09-29T08:30:00+05:30");
  assert.equal(day.hours, 9);
});

test("a day with none of that provider is an empty day, not an error", () => {
  const day = summariseDay([row("CELPIP", "CELPIP General", 9, "09:00", "12:00")], "PSI", "2026-09-29");
  assert.ok(day.connected);
  assert.equal(day.count, 0);
  assert.equal(day.hours, null);
});

test("a slot without an end finishes when it starts", () => {
  const day = summariseDay([row("PSI", "X", 1, "10:00", null)], "PSI", "2026-09-29");
  assert.ok(day.connected);
  assert.equal(day.exams[0].end, "2026-09-29T10:00:00+05:30");
  assert.equal(day.hours, 0);
});

const jwt = (role: string) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;

test("only keys that pass signed-in-only rules count as secret", () => {
  assert.equal(isSecretKey("sb_secret_abc"), true);
  assert.equal(isSecretKey(jwt("service_role")), true);
  assert.equal(isSecretKey("sb_publishable_abc"), false);
  assert.equal(isSecretKey(jwt("anon")), false);
  assert.equal(isSecretKey("eyJnot-a-jwt"), false);
});

test("mock exams are no provider's", () => {
  assert.equal(providerOf("MOCK EXAM - CMA US", "MOCK"), null);
});

test("one exam typed several ways is one exam", () => {
  const day = summariseDay(
    [
      row("PEARSON VUE", "Microsoft", 1, "08:00:00", "09:05:00"),
      row("PEARSON VUE", "MICROSOFT ", 1, "08:00:00", "10:00:00"),
      row("PEARSON VUE", "microsoft", 1, "10:30:00", "11:30:00"),
      row("PEARSON VUE", "ANTHROPIC", 1, "10:30:00", "12:45:00"),
    ],
    "Pearson VUE",
    "2026-09-29",
  );
  assert.ok(day.connected);
  assert.deepEqual(
    day.exams.map((e) => [e.name, e.count]),
    [
      ["Microsoft", 3],
      ["ANTHROPIC", 1],
    ],
  );
  assert.equal(day.hours, 4.75);
});
