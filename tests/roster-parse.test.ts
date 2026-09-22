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
  assert.match(preview.issues[0].message, /No column names were recognised/);
  assert.ok(preview.diagnostics, "a failure has to say what it saw");
  assert.equal(preview.diagnostics.rows_found, 2);
});

test("finds the roster when it is not on the first sheet", async () => {
  const wb = new ExcelJS.Workbook();
  const cover = wb.addWorksheet("Instructions");
  cover.addRow(["Please do not edit this workbook"]);
  cover.addRow([]);
  const data = wb.addWorksheet("Candidates");
  data.addRow(["Roster No", "Name", "Part"]);
  data.addRow(["1", "Aparna Menon", "A"]);
  data.addRow(["2", "Rahul Krishnan", "B"]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const preview = await parseRosterFile("roster.xlsx", buffer);

  assert.equal(preview.rows.length, 2);
  assert.equal(preview.sheet_used, "Candidates");
});

test("reads the board column names centres actually use", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["Roll No", "Candidate", "Mobile Number"]);
  ws.addRow(["77", "Fathima Zahra", "98765 43210"]);

  const preview = await parseRosterFile("x.xlsx", Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].roster_number, "77");
  assert.equal(preview.rows[0].first_name, "Fathima");
  assert.equal(preview.rows[0].phone, "9876543210");
});

test("a failed detection reports structure and never candidate data", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  // No header at all — just people. Nothing here may be echoed back.
  ws.addRow(["Aparna Menon", "9876543210", "Calicut"]);
  ws.addRow(["Rahul Krishnan", "9876543211", "Kochi"]);

  const preview = await parseRosterFile("x.xlsx", Buffer.from(await wb.xlsx.writeBuffer()));
  const d = preview.diagnostics;

  assert.ok(d, "diagnostics should be present");
  assert.deepEqual(d.sheets, ["Data"]);
  assert.equal(d.rows_found, 2);
  assert.equal(d.header_cells, null, "no header was recognised, so no text is echoed");

  const blob = JSON.stringify(preview);
  for (const secret of ["Aparna", "Menon", "9876543210", "Calicut", "Rahul"]) {
    assert.ok(!blob.includes(secret), `${secret} must not appear in the response`);
  }
});

test("a half-recognised header is echoed back, since it is not personal data", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow(["Name", "Appointment Slot", "Venue Notes"]);
  ws.addRow(["Aparna Menon", "09:00", "Lab A"]);

  const preview = await parseRosterFile("x.xlsx", Buffer.from(await wb.xlsx.writeBuffer()));
  const d = preview.diagnostics;

  assert.ok(d);
  assert.deepEqual(d.matched_fields, ["full_name"]);
  assert.deepEqual(d.header_cells, ["Name", "Appointment Slot", "Venue Notes"]);
  assert.ok(!JSON.stringify(preview).includes("Aparna"));
  assert.match(preview.issues[0].message, /Only one column was recognised/);
});

test("a merged date banner is a separator, not a candidate", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["Roster No", "Name", "Part", "Phone", "Place"]);
  // Excel hands a merged row back as the same value in every covered cell.
  ws.addRow(["2026-09-01", "2026-09-01", "2026-09-01", "2026-09-01", "2026-09-01"]);
  ws.addRow(["1", "Jeremiah Binoi", "PART 2", "8921545788", "ERNAKULAM"]);
  ws.addRow(["2", "Afra Fathima", "PART 1", "8086915811", "THALASSERY"]);

  const preview = await parseRosterFile("r.xlsx", Buffer.from(await wb.xlsx.writeBuffer()));

  assert.equal(preview.rows.length, 2, "the banner must not become a candidate");
  assert.equal(preview.counts.skipped, 1);
  assert.deepEqual(
    preview.rows.map((r) => r.first_name),
    ["Jeremiah", "Afra"],
  );
});

test("a center can teach the importer a column heading of its own", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Roster");
  // Headings no built-in alias covers: a board that calls things its own way.
  sheet.addRow(["Docket", "Examinee", "Cell", "Hometown"]);
  sheet.addRow(["D-1001", "Fatima Noor", "9847011223", "Calicut"]);
  sheet.addRow(["D-1002", "Rahul Menon", "9961044556", "Kannur"]);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());

  const untaught = await parseRosterFile("odd.xlsx", buffer);
  assert.equal(untaught.rows.length, 0, "nothing should import before the headings are taught");

  const taught = await parseRosterFile("odd.xlsx", buffer, {
    roster_number: ["docket"],
    full_name: ["examinee"],
    phone: ["cell"],
    place: ["hometown"],
  });

  assert.equal(taught.rows.length, 2);
  assert.equal(taught.rows[0].roster_number, "D-1001");
  assert.equal(taught.rows[0].first_name, "Fatima");
  assert.equal(taught.rows[0].last_name, "Noor");
  assert.equal(taught.rows[0].phone, "9847011223");
  assert.equal(taught.rows[0].place, "Calicut");
});

test("a center's own heading wins over a built-in one", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Roster");
  // "Name" is a built-in alias for the full name. A center that uses "Name" for
  // something else and "Candidate" for the person must be able to say so.
  sheet.addRow(["Roster No", "Name", "Candidate"]);
  sheet.addRow(["A-1", "CELPIP General", "Fatima Noor"]);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());

  const taught = await parseRosterFile("odd.xlsx", buffer, { full_name: ["candidate"] });
  assert.equal(taught.rows.length, 1);
  assert.equal(taught.rows[0].first_name, "Fatima");
  assert.equal(taught.rows[0].last_name, "Noor");
});
