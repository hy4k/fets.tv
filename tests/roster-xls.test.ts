import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { parseRosterFile } from "../lib/roster/parse.ts";
import { isLegacyXls, readLegacyXls } from "../lib/roster/xls.ts";

/**
 * The fixtures carry the exact column layout the boards export, with invented
 * people. They were written as real BIFF8 workbooks, so these exercise the
 * legacy .xls reader itself and not just the column mapping.
 */
const fixture = (name: string) =>
  fs.readFileSync(path.join(import.meta.dirname, "fixtures", name));

test("a legacy .xls is recognised and read", () => {
  const buffer = fixture("site-roster.xls");
  assert.ok(isLegacyXls(buffer));

  const sheets = readLegacyXls(buffer);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, "SiteRoster.rdl");
  assert.equal(sheets[0].grid[0][0], "First Name");
  assert.equal(sheets[0].grid[1][0], "Asha");
});

test("an .xlsx is not mistaken for a legacy .xls", () => {
  assert.equal(isLegacyXls(Buffer.from("PK\u0003\u0004rest-of-a-zip")), false);
});

test("a date cell comes back readable, not as a serial number", () => {
  const sheets = readLegacyXls(fixture("site-roster.xls"));
  assert.match(sheets[0].grid[1][6], /^2026-06-29 04:30$/);
});

test("site roster: part comes out of the exam name, placeholder surnames go", async () => {
  const preview = await parseRosterFile("site-roster.xls", fixture("site-roster.xls"));

  assert.equal(preview.rows.length, 3);
  assert.equal(preview.counts.errors, 0);

  assert.deepEqual(
    preview.rows.map((r) => [r.first_name, r.last_name].filter(Boolean).join(" ")),
    ["Asha", "Bilal Rahman", "Clara"],
    "NO LAST NAME and No Surname must not become part of a candidate's name",
  );
  assert.deepEqual(
    preview.rows.map((r) => r.part),
    ["PART 1", "PART 2", "PART 2"],
  );
  assert.deepEqual(
    preview.rows.map((r) => r.roster_number),
    ["8890000000000001", "8890000000000002", "8890000000000003"],
  );
});

test("contact report: header on row 7, surname first, phone from either column", async () => {
  const preview = await parseRosterFile("contact-report.xls", fixture("contact-report.xls"));

  assert.equal(preview.header_row, 7);
  assert.equal(preview.rows.length, 2);
  assert.deepEqual(
    preview.rows.map((r) => [r.first_name, r.last_name].filter(Boolean).join(" ")),
    ["Asha", "Bilal Rahman"],
  );
  assert.deepEqual(
    preview.rows.map((r) => r.phone),
    ["910000000001", "910000000002"],
    "the evening number is used when the daytime one is blank",
  );
});

test("a report with no part column does not warn on every row", async () => {
  const preview = await parseRosterFile("contact-report.xls", fixture("contact-report.xls"));
  assert.equal(preview.counts.warnings, 0);
  assert.deepEqual(preview.rows.map((r) => r.part), [null, null]);
});

test("missing fields are left blank rather than guessed", async () => {
  const preview = await parseRosterFile("site-roster.xls", fixture("site-roster.xls"));
  for (const row of preview.rows) {
    assert.equal(row.phone, null);
    assert.equal(row.place, null);
  }
});
