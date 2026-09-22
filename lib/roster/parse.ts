import ExcelJS from "exceljs";
import Papa from "papaparse";
import { isLegacyXls, readLegacyXls } from "./xls.ts";
import type { RosterIssue, RosterPreview, RosterRow } from "@/lib/types";

const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  roster_number: [
    "roster no",
    "roster number",
    "roster",
    "sl no",
    "sl. no",
    "serial",
    "serial no",
    "reg no",
    "registration no",
    "registration number",
    "candidate id",
    "candidate no",
    "roll no",
    "roll number",
    "roll",
    "appointment no",
    "appointment number",
    "confirmation no",
    "confirmation number",
    "booking ref",
    "booking reference",
    "reference no",
    "ref no",
    "candidate ref",
    "confirmation",
    "confirmation number",
  ],
  full_name: ["name", "candidate name", "student name", "full name", "candidate", "applicant", "applicant name", "name of candidate"],
  first_name: ["first name", "firstname", "given name", "candidate first name"],
  last_name: ["last name", "lastname", "surname", "family name", "candidate last name"],
  part: ["part", "section", "module", "paper"],
  exam_name: ["exam name", "exam", "programme", "program", "programme name", "program name"],
  phone: ["phone", "phone no", "phone number", "mobile", "mobile no", "mobile number", "contact", "contact no", "contact number", "telephone", "tel", "whatsapp", "daytime phone", "evening phone"],
  place: ["place", "city", "town", "district", "location"],
  roster_flag: ["flag", "status", "remark", "remarks", "note", "notes", "exception"],
};

type ColumnMap = {
  roster_number: number | null;
  exam_name: number | null;
  full_name: number | null;
  first_name: number | null;
  last_name: number | null;
  part: number | null;
  phone: number | null;
  place: number | null;
  roster_flag: number | null;
};

export async function parseRosterFile(filename: string, buffer: Buffer): Promise<RosterPreview> {
  // Boards export .xls, which is a different format from .xlsx entirely.
  const sheets = isLegacyXls(buffer)
    ? readLegacyXls(buffer)
    : /\.csv$/i.test(filename)
      ? [{ name: filename, grid: parseCsv(buffer) }]
      : await parseXlsx(buffer);

  // Centres send workbooks with a cover sheet, or the roster on the second tab,
  // so take the first sheet that actually has a header rather than assuming.
  let fallback: { name: string; grid: string[][] } | null = null;

  for (const sheet of sheets) {
    if (detectHeaderRow(sheet.grid).index !== -1) return buildPreview(filename, sheet.grid, sheet.name);
    const size = sheet.grid.reduce((n, row) => n + row.filter(Boolean).length, 0);
    const best = fallback ? fallback.grid.reduce((n, row) => n + row.filter(Boolean).length, 0) : -1;
    if (size > best) fallback = sheet;
  }

  return buildPreview(
    filename,
    fallback?.grid ?? [],
    fallback?.name ?? null,
    sheets.map((s) => s.name),
  );
}

function parseCsv(buffer: Buffer): string[][] {
  const result = Papa.parse<string[]>(buffer.toString("utf8"), { skipEmptyLines: false });
  return result.data.map((row) => (Array.isArray(row) ? row.map(clean) : []));
}

async function parseXlsx(buffer: Buffer): Promise<{ name: string; grid: string[][] }[]> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS types want an ArrayBuffer-backed view; a Buffer slice is exactly that.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  return workbook.worksheets.map((sheet) => ({ name: sheet.name, grid: readSheet(sheet) }));
}

function readSheet(sheet: ExcelJS.Worksheet): string[][] {
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = clean(cellText(cell.value));
    });
    grid[rowNumber - 1] = Array.from(cells, (c) => c ?? "");
  });

  return Array.from(grid, (row) => row ?? []);
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("hyperlink" in value && typeof value.hyperlink === "string") return value.hyperlink;
  }
  return "";
}

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Scan the first rows for the one that actually names the columns. */
function detectHeaderRow(grid: string[][]): {
  index: number;
  columns: ColumnMap;
  best: { index: number; score: number; columns: ColumnMap };
} {
  let best = { index: -1, score: 0, columns: emptyColumns() };

  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const columns = matchColumns(grid[i] ?? []);
    const score = Object.values(columns).filter((v) => v !== null).length;
    if (score > best.score) best = { index: i, score, columns };
  }

  return best.score >= 2
    ? { index: best.index, columns: best.columns, best }
    : { index: -1, columns: emptyColumns(), best };
}

function emptyColumns(): ColumnMap {
  return {
    roster_number: null,
    exam_name: null,
    full_name: null,
    first_name: null,
    last_name: null,
    part: null,
    phone: null,
    place: null,
    roster_flag: null,
  };
}

/** Every column whose heading reads like a phone number, in order. */
function phoneColumns(row: string[]): number[] {
  const out: number[] = [];
  row.forEach((raw, index) => {
    const cell = cleanHeader(raw);
    if (!cell) return;
    if (HEADER_ALIASES.phone.some((alias) => matchesAlias(cell, alias))) {
      out.push(index);
    }
  });
  return out;
}

/**
 * A heading matches an alias outright, or begins with it — but only for
 * aliases of two words or more. Letting the single word "candidate" match by
 * prefix made "Candidate Last Name" read as the full name and silently threw
 * the surname away.
 */
function matchesAlias(cell: string, alias: string): boolean {
  if (cell === alias) return true;
  return alias.includes(" ") && cell.startsWith(`${alias} `);
}

function cleanHeader(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9 .]/g, " ").replace(/\s+/g, " ").trim();
}

function matchColumns(row: string[]): ColumnMap {
  const columns = emptyColumns();

  row.forEach((raw, index) => {
    const cell = cleanHeader(raw);
    if (!cell) return;

    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof ColumnMap, string[]][]) {
      if (columns[field] !== null) continue;
      if (aliases.some((alias) => matchesAlias(cell, alias))) {
        columns[field] = index;
        return;
      }
    }
  });

  return columns;
}

function buildPreview(
  filename: string,
  grid: string[][],
  sheetName: string | null = null,
  allSheets: string[] = [],
): RosterPreview {
  const { index: headerIndex, columns, best } = detectHeaderRow(grid);
  const phones = headerIndex === -1 ? [] : phoneColumns(grid[headerIndex] ?? []);

  // Does this file carry the part inside its exam name? One row proving it
  // makes a row that fails worth reporting.
  const examNameCarriesPart =
    headerIndex !== -1 &&
    columns.exam_name !== null &&
    grid
      .slice(headerIndex + 1)
      .some((row) => partFromExamName(row?.[columns.exam_name as number] ?? "") !== null);
  const rows: RosterRow[] = [];
  const issues: RosterIssue[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let noShow = 0;
  let warnings = 0;

  if (headerIndex === -1) {
    const matched = Object.entries(best.columns)
      .filter(([, index]) => index !== null)
      .map(([field]) => field);

    // Rosters carry candidates' names and phone numbers, so the diagnostic
    // reports structure only. The row's own text is echoed back just when at
    // least one column name was recognised — which is what makes it a header
    // row rather than somebody's personal details.
    const headerCells =
      matched.length > 0 ? (grid[best.index] ?? []).filter((cell) => cell !== "").slice(0, 25) : null;

    return {
      filename,
      header_row: 0,
      columns: {},
      rows: [],
      issues: [
        {
          source_row: 0,
          level: "error",
          message:
            matched.length === 1
              ? `Only one column was recognised (${matched[0].replace(/_/g, " ")}). The importer needs at least two.`
              : "No column names were recognised in the first 20 rows.",
        },
      ],
      counts: { valid: 0, warnings: 0, errors: 1, no_show: 0, skipped: 0 },
      diagnostics: {
        sheets: allSheets,
        sheet_used: sheetName,
        rows_found: grid.length,
        columns_found: grid.reduce((n, row) => Math.max(n, row.length), 0),
        best_row: best.index >= 0 ? best.index + 1 : 0,
        matched_fields: matched,
        header_cells: headerCells,
        understood: HEADER_ALIASES,
      },
    };
  }

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const sourceRow = i + 1;
    const at = (col: number | null) => (col === null ? "" : (row[col] ?? ""));
    const filled = row.filter((cell) => cell !== "").length;

    // Blank rows, and the one-cell separator bands real rosters are full of
    // ("--- MORNING BATCH ---"). A lone cell carrying digits is a data row
    // missing its name, so that still gets reported rather than dropped.
    const loneCell = filled === 1 ? (row.find((cell) => cell !== "") ?? "") : null;
    if (filled === 0 || (loneCell !== null && !/\d/.test(loneCell))) {
      skipped++;
      continue;
    }

    // A merged cell spanning the row — the date banners rosters are divided by —
    // reaches us as the same value repeated in every cell it covers. Left alone
    // it imports as a candidate named after the date, and that name reaches the
    // hall TV.
    const values = row.filter((cell) => cell !== "");
    if (values.length > 1 && new Set(values).size === 1) {
      skipped++;
      continue;
    }

    const rosterNumber = at(columns.roster_number);
    const { first, last } = splitName(at(columns.full_name), at(columns.first_name), at(columns.last_name));
    const flag = at(columns.roster_flag) || null;

    if (!rosterNumber) {
      issues.push({ source_row: sourceRow, level: "error", message: "Missing roster number" });
      continue;
    }

    if (!first && !last) {
      issues.push({ source_row: sourceRow, level: "error", message: `${rosterNumber}: missing name` });
      continue;
    }

    if (seen.has(rosterNumber)) {
      issues.push({ source_row: sourceRow, level: "error", message: `${rosterNumber}: duplicate roster number` });
      continue;
    }
    seen.add(rosterNumber);

    const part = normalisePart(at(columns.part)) || partFromExamName(at(columns.exam_name));
    if ((columns.part !== null || examNameCarriesPart) && !part) {
      issues.push({ source_row: sourceRow, level: "warning", message: `${rosterNumber}: no part recorded` });
      warnings++;
    }

    if (flag && /no\s*show/i.test(flag)) noShow++;

    rows.push({
      source_row: sourceRow,
      roster_number: rosterNumber,
      first_name: first,
      last_name: last,
      part,
      phone: normalisePhone(phones.map((column) => row[column] ?? "").find(Boolean) ?? at(columns.phone)),
      place: at(columns.place) || null,
      roster_flag: flag,
    });
  }

  const errors = issues.filter((i) => i.level === "error").length;

  return {
    filename,
    sheet_used: sheetName,
    header_row: headerIndex + 1,
    columns: Object.fromEntries(
      Object.entries(columns).map(([field, index]) => [
        field,
        index === null ? null : ((grid[headerIndex] ?? [])[index] ?? null),
      ]),
    ),
    rows,
    issues: issues.slice(0, 50),
    counts: { valid: rows.length - noShow, warnings, errors, no_show: noShow, skipped },
  };
}

/**
 * Boards fill an absent surname in with a placeholder rather than leaving it
 * blank, and it would otherwise be announced as part of the person's name.
 */
const PLACEHOLDER_SURNAMES = [
  "no last name",
  "no lastname",
  "no surname",
  "nosurname",
  "not available",
  "na",
  "n a",
  "nil",
  "none",
  "-",
  ".",
];

function isPlaceholderSurname(value: string): boolean {
  const bare = value.toLowerCase().replace(/[^a-z]/g, " ").replace(/\s+/g, " ").trim();
  return bare === "" || PLACEHOLDER_SURNAMES.includes(bare);
}

/**
 * The given name only loses punctuation-only values. "Nil", "Na" and "None"
 * are real given names somewhere, and clearing one would promote the surname
 * into its place.
 */
function isEmptyGivenName(value: string): boolean {
  return value.replace(/[^\p{L}\p{N}]/gu, "").trim() === "";
}

/** "PART 2 CMA EXAM- ESSAY" is the exam; the part inside it is what staff need. */
function partFromExamName(examName: string): string | null {
  const match = examName.match(/\bpart\s*([0-9]+|i{1,3})\b/i);
  if (!match) return null;
  const roman: Record<string, string> = { i: "1", ii: "2", iii: "3" };
  const value = match[1].toLowerCase();
  return `PART ${roman[value] ?? value}`;
}

function normalisePart(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return partFromExamName(trimmed) ?? trimmed;
}

function splitName(full: string, first: string, last: string) {
  if (isPlaceholderSurname(last)) last = "";
  if (isEmptyGivenName(first)) first = "";
  if (first || last) return { first: first || last, last: first ? last : "" };
  if (!full) return { first: "", last: "" };

  const parts = full.split(" ");
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function normalisePhone(value: string): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, "");
  return digits || null;
}
