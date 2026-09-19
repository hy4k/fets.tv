import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { parseRosterFile } from "../lib/roster/parse.ts";

/** A roster shaped like the ones centers actually send. */
async function sampleXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["FETS CALICUT — CELPIP SEPTEMBER"]);
  ws.addRow([]);
  ws.addRow(["Roster No", "Name", "Part", "Phone", "Place", "Remarks"]);
  ws.addRow(["4960-001", "  Aparna   Venugopal ", "II", "98 4700 1234", "Kozhikode", ""]);
  ws.addRow(["4960-002", "Mohammed Rashid", "I", "+91-9847002345", "Feroke", ""]);
  ws.addRow(["--- MORNING BATCH ---"]);
  ws.addRow([]);
  ws.addRow(["4960-003", "Nisha Balakrishnan", "", "9847003456", "Ramanattukara", ""]);
  ws.addRow(["4960-003", "Nisha Balakrishnan", "II", "9847003456", "Ramanattukara", ""]);
  ws.addRow(["4960-004", "Sreejith Kumar", "I", "9847004567", "Beypore", "NO SHOW"]);
  ws.addRow(["4960-006", "", "I", "", "", ""]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("finds the header row below title rows", async () => {
  const preview = await parseRosterFile("roster.xlsx", await sampleXlsx());
  assert.equal(preview.header_row, 3);
  assert.equal(preview.columns.roster_number, "Roster No");
});

test("normalises names, phones and keeps the source row", async () => {
  const preview = await parseRosterFile("roster.xlsx", await sampleXlsx());
  const first = preview.rows[0];
  assert.equal(first.first_name, "Aparna");
  assert.equal(first.last_name, "Venugopal");
  assert.equal(first.phone, "9847001234");
  assert.equal(first.source_row, 4);
  assert.equal(preview.rows[1].phone, "+919847002345");
});

test("skips separator bands but reports rows missing required fields", async () => {
  const preview = await parseRosterFile("roster.xlsx", await sampleXlsx());
  assert.equal(preview.counts.skipped, 2, "separator band and blank row");
  assert.ok(!preview.issues.some((i) => i.message.includes("MORNING BATCH")));
  assert.ok(preview.issues.some((i) => i.source_row === 11 && i.message.includes("missing name")));
});

test("rejects duplicate roster numbers and warns on a missing part", async () => {
  const preview = await parseRosterFile("roster.xlsx", await sampleXlsx());
  assert.equal(preview.rows.filter((r) => r.roster_number === "4960-003").length, 1);
  assert.ok(preview.issues.some((i) => i.message.includes("duplicate roster number")));
  assert.ok(preview.issues.some((i) => i.level === "warning" && i.message.includes("no part")));
});

test("keeps NO SHOW as an exception rather than a stage", async () => {
  const preview = await parseRosterFile("roster.xlsx", await sampleXlsx());
  const noShow = preview.rows.find((r) => r.roster_number === "4960-004");
  assert.equal(noShow?.roster_flag, "NO SHOW");
  assert.equal(preview.counts.no_show, 1);
  assert.equal(preview.counts.valid, 3);
});

test("reads csv with split first/last name columns", async () => {
  const csv = [
    "FETS CALICUT",
    "",
    "Sl No,First Name,Last Name,Part,Mobile,City,Status",
    "4960-101,Fathima,Noor,II,9847111111,Calicut,",
    ",,,,,,",
    "4960-102,Arun,Menon,I,9847222222,Malappuram,NO SHOW",
  ].join("\n");

  const preview = await parseRosterFile("roster.csv", Buffer.from(csv, "utf8"));
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0].first_name, "Fathima");
  assert.equal(preview.rows[0].last_name, "Noor");
  assert.equal(preview.counts.no_show, 1);
});

test("explains itself when there is no recognisable header", async () => {
  const preview = await parseRosterFile("junk.csv", Buffer.from("a,b\n1,2", "utf8"));
  assert.equal(preview.rows.length, 0);
  assert.equal(preview.counts.errors, 1);
  assert.match(preview.issues[0].message, /header row/);
});
