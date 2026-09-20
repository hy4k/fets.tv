/**
 * A reader for legacy .xls workbooks — the format Prometric and Pearson export
 * their rosters in. ExcelJS only opens .xlsx, and the one general-purpose .xls
 * library on npm is pinned to a release with known parser CVEs, which is not
 * something to put in front of an uploaded file in an exam system.
 *
 * So this reads only what a roster needs: the sheet names and the text of each
 * cell. Formulas are taken at their cached value, and every other record —
 * macros, drawings, external links — is skipped by length without being
 * interpreted. Anything it cannot make sense of becomes an empty cell rather
 * than an exception.
 */

const CFB_SIGNATURE = "d0cf11e0a1b11ae1";
const FREE_SECTOR = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;

export function isLegacyXls(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === CFB_SIGNATURE;
}

export function readLegacyXls(buffer: Buffer): { name: string; grid: string[][] }[] {
  const workbook = readCfbStream(buffer, ["Workbook", "Book"]);
  if (!workbook) throw new Error("this .xls file has no workbook stream");
  return readBiff(workbook);
}

/* ------------------------------------------------------------------ *
 * The OLE compound file the .xls lives inside
 * ------------------------------------------------------------------ */

function readCfbStream(buffer: Buffer, names: string[]): Buffer | null {
  const sectorSize = 1 << buffer.readUInt16LE(30);
  const miniSectorSize = 1 << buffer.readUInt16LE(32);
  const directoryStart = buffer.readUInt32LE(48);
  const miniCutoff = buffer.readUInt32LE(56);
  const miniFatStart = buffer.readUInt32LE(60);
  const difatStart = buffer.readUInt32LE(68);
  const difatCount = buffer.readUInt32LE(72);

  const sectorOffset = (sector: number) => (sector + 1) * sectorSize;

  // The FAT's own sectors are listed in the header, and then continued in a
  // chain of DIFAT sectors for workbooks large enough to need them.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const sector = buffer.readUInt32LE(76 + i * 4);
    if (sector === FREE_SECTOR) break;
    fatSectors.push(sector);
  }

  let difat = difatStart;
  for (let i = 0; i < difatCount && difat !== END_OF_CHAIN && difat !== FREE_SECTOR; i++) {
    const base = sectorOffset(difat);
    if (base + sectorSize > buffer.length) break;
    const perSector = sectorSize / 4 - 1;
    for (let j = 0; j < perSector; j++) {
      const sector = buffer.readUInt32LE(base + j * 4);
      if (sector === FREE_SECTOR) continue;
      fatSectors.push(sector);
    }
    difat = buffer.readUInt32LE(base + perSector * 4);
  }

  const fat: number[] = [];
  for (const sector of fatSectors) {
    const base = sectorOffset(sector);
    if (base + sectorSize > buffer.length) continue;
    for (let i = 0; i < sectorSize / 4; i++) fat.push(buffer.readUInt32LE(base + i * 4));
  }

  const chain = (start: number, table: number[]) => {
    const sectors: number[] = [];
    let sector = start;
    const seen = new Set<number>();
    while (sector !== END_OF_CHAIN && sector !== FREE_SECTOR && !seen.has(sector)) {
      seen.add(sector);
      sectors.push(sector);
      sector = table[sector] ?? END_OF_CHAIN;
    }
    return sectors;
  };

  const readChain = (start: number, size: number) => {
    const parts = chain(start, fat).map((sector) => {
      const base = sectorOffset(sector);
      return buffer.subarray(base, Math.min(base + sectorSize, buffer.length));
    });
    return Buffer.concat(parts).subarray(0, size);
  };

  // Directory entries are 128 bytes each, name in UTF-16LE.
  const directory = readChain(directoryStart, Number.MAX_SAFE_INTEGER);
  const entries: { name: string; type: number; start: number; size: number }[] = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directory.readUInt16LE(offset + 64);
    if (nameLength < 2) continue;
    const name = directory
      .subarray(offset, offset + Math.min(nameLength, 64) - 2)
      .toString("utf16le");
    entries.push({
      name,
      type: directory.readUInt8(offset + 66),
      start: directory.readUInt32LE(offset + 116),
      size: directory.readUInt32LE(offset + 120),
    });
  }

  const wanted = entries.find((e) => e.type === 2 && names.includes(e.name));
  if (!wanted) return null;

  if (wanted.size >= miniCutoff) return readChain(wanted.start, wanted.size);

  // Small streams live in the mini stream, itself held by the root entry.
  const root = entries.find((e) => e.type === 5);
  if (!root) return null;

  const miniFatRaw = readChain(miniFatStart, Number.MAX_SAFE_INTEGER);
  const miniFat: number[] = [];
  for (let i = 0; i + 4 <= miniFatRaw.length; i += 4) miniFat.push(miniFatRaw.readUInt32LE(i));

  const miniStream = readChain(root.start, root.size);
  const parts = chain(wanted.start, miniFat).map((sector) => {
    const base = sector * miniSectorSize;
    return miniStream.subarray(base, Math.min(base + miniSectorSize, miniStream.length));
  });
  return Buffer.concat(parts).subarray(0, wanted.size);
}

/* ------------------------------------------------------------------ *
 * The BIFF records inside the workbook stream
 * ------------------------------------------------------------------ */

const REC = {
  FORMULA: 0x0006,
  EOF: 0x000a,
  CONTINUE: 0x003c,
  MULRK: 0x00bd,
  MULBLANK: 0x00be,
  RK: 0x027e,
  LABELSST: 0x00fd,
  LABEL: 0x0204,
  NUMBER: 0x0203,
  BOUNDSHEET: 0x0085,
  SST: 0x00fc,
  STRING: 0x0207,
  BOF: 0x0809,
  FORMAT: 0x041e,
  XF: 0x00e0,
} as const;

type Record_ = { type: number; data: Buffer };

function records(stream: Buffer): Record_[] {
  const out: Record_[] = [];
  let offset = 0;
  while (offset + 4 <= stream.length) {
    const type = stream.readUInt16LE(offset);
    const length = stream.readUInt16LE(offset + 2);
    const start = offset + 4;
    if (start + length > stream.length) break;
    out.push({ type, data: stream.subarray(start, start + length) });
    offset = start + length;
  }
  return out;
}

function readBiff(stream: Buffer): { name: string; grid: string[][] }[] {
  const all = records(stream);

  const sheets: { name: string; offset: number }[] = [];
  for (const record of all) {
    if (record.type !== REC.BOUNDSHEET || record.data.length < 8) continue;
    sheets.push({
      name: readShortString(record.data, 6),
      offset: record.data.readUInt32LE(0),
    });
  }

  const strings = readSharedStrings(all);
  const dateXfs = readDateFormats(all);

  // Each sheet's records start at its BOUNDSHEET offset into the same stream.
  const result: { name: string; grid: string[][] }[] = [];

  for (const [index, sheet] of sheets.entries()) {
    const next = sheets[index + 1]?.offset ?? stream.length;
    const slice = stream.subarray(sheet.offset, Math.min(next, stream.length));
    result.push({
      name: sheet.name || `Sheet${index + 1}`,
      grid: readSheet(records(slice), strings, dateXfs),
    });
  }

  if (result.length === 0) result.push({ name: "Sheet1", grid: readSheet(all, strings, dateXfs) });
  return result;
}

function readSheet(sheetRecords: Record_[], strings: string[], dateXfs: Set<number>): string[][] {
  const grid: string[][] = [];
  const put = (row: number, column: number, value: string) => {
    if (row < 0 || column < 0 || row > 1_048_576 || column > 16_384) return;
    (grid[row] ??= [])[column] = value;
  };

  let lastFormulaCell: { row: number; column: number } | null = null;

  for (const record of sheetRecords) {
    const d = record.data;
    switch (record.type) {
      case REC.LABELSST: {
        if (d.length < 10) break;
        put(d.readUInt16LE(0), d.readUInt16LE(2), strings[d.readUInt32LE(6)] ?? "");
        break;
      }
      case REC.LABEL: {
        if (d.length < 8) break;
        put(d.readUInt16LE(0), d.readUInt16LE(2), readLongString(d, 6));
        break;
      }
      case REC.NUMBER: {
        if (d.length < 14) break;
        put(d.readUInt16LE(0), d.readUInt16LE(2), cell(d.readDoubleLE(6), d.readUInt16LE(4), dateXfs));
        break;
      }
      case REC.RK: {
        if (d.length < 10) break;
        put(
          d.readUInt16LE(0),
          d.readUInt16LE(2),
          cell(decodeRk(d.readUInt32LE(6)), d.readUInt16LE(4), dateXfs),
        );
        break;
      }
      case REC.MULRK: {
        if (d.length < 6) break;
        const row = d.readUInt16LE(0);
        const first = d.readUInt16LE(2);
        const count = Math.floor((d.length - 6) / 6);
        for (let i = 0; i < count; i++) {
          const base = 4 + i * 6;
          put(row, first + i, cell(decodeRk(d.readUInt32LE(base + 2)), d.readUInt16LE(base), dateXfs));
        }
        break;
      }
      case REC.MULBLANK:
      case 0x0201: /* BLANK */
        break;
      case REC.FORMULA: {
        // A formula caches its own result; a string result follows in STRING.
        if (d.length < 16) break;
        lastFormulaCell = { row: d.readUInt16LE(0), column: d.readUInt16LE(2) };
        const isText = d.readUInt16LE(12) === 0xffff && d.readUInt8(6) === 0x00;
        if (!isText) {
          put(lastFormulaCell.row, lastFormulaCell.column, formatNumber(d.readDoubleLE(6)));
          lastFormulaCell = null;
        }
        break;
      }
      case REC.STRING: {
        if (lastFormulaCell && d.length >= 3) {
          put(lastFormulaCell.row, lastFormulaCell.column, readLongString(d, 0));
        }
        lastFormulaCell = null;
        break;
      }
      default:
        break;
    }
  }

  const width = grid.reduce((n, row) => Math.max(n, row?.length ?? 0), 0);
  return Array.from({ length: grid.length }, (_, r) =>
    Array.from({ length: width }, (_, c) => grid[r]?.[c] ?? ""),
  );
}

/** The shared string table, which spills across CONTINUE records. */
function readSharedStrings(all: Record_[]): string[] {
  const index = all.findIndex((r) => r.type === REC.SST);
  if (index === -1) return [];

  const chunks = [all[index].data];
  for (let i = index + 1; i < all.length && all[i].type === REC.CONTINUE; i++) chunks.push(all[i].data);

  // Each CONTINUE repeats the flags byte for a string it splits, so the table
  // is walked as one buffer with the boundaries remembered.
  const boundaries = new Set<number>();
  let running = 0;
  for (const chunk of chunks) {
    running += chunk.length;
    boundaries.add(running);
  }
  const sst = Buffer.concat(chunks);

  const total = sst.length >= 8 ? sst.readUInt32LE(4) : 0;
  const strings: string[] = [];
  let offset = 8;

  for (let i = 0; i < total && offset + 3 <= sst.length; i++) {
    let length = sst.readUInt16LE(offset);
    let flags = sst.readUInt8(offset + 2);
    offset += 3;

    let runCount = 0;
    let extendedBytes = 0;
    if ((flags & 0x08) !== 0 && offset + 2 <= sst.length) {
      runCount = sst.readUInt16LE(offset);
      offset += 2;
    }
    if ((flags & 0x04) !== 0 && offset + 4 <= sst.length) {
      extendedBytes = sst.readUInt32LE(offset);
      offset += 4;
    }

    let text = "";
    while (length > 0 && offset <= sst.length) {
      const wide = (flags & 0x01) !== 0;
      const available = nextBoundary(boundaries, offset) - offset;
      const take = Math.min(length, wide ? Math.floor(available / 2) : available);
      if (take <= 0) {
        // The string continues in the next record, which restates its flags.
        if (offset >= sst.length) break;
        flags = sst.readUInt8(offset);
        offset += 1;
        continue;
      }
      const bytes = wide ? take * 2 : take;
      text += wide
        ? sst.subarray(offset, offset + bytes).toString("utf16le")
        : latin1ToString(sst.subarray(offset, offset + bytes));
      offset += bytes;
      length -= take;
      if (length > 0) {
        if (offset >= sst.length) break;
        flags = sst.readUInt8(offset);
        offset += 1;
      }
    }

    strings.push(text);

    // Rich-text runs and Far East phonetic data trail the characters. They are
    // not needed, but they have to be stepped over or the next string starts
    // at the wrong byte — which silently truncates it.
    if (runCount > 0) offset += runCount * 4;
    if (extendedBytes > 0) offset += extendedBytes;
  }

  return strings;
}

function nextBoundary(boundaries: Set<number>, offset: number): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const boundary of boundaries) {
    if (boundary > offset && boundary < best) best = boundary;
  }
  return best;
}

function latin1ToString(bytes: Buffer): string {
  return bytes.toString("latin1");
}

function readShortString(data: Buffer, offset: number): string {
  if (offset + 2 > data.length) return "";
  const length = data.readUInt8(offset);
  const wide = (data.readUInt8(offset + 1) & 0x01) !== 0;
  const bytes = wide ? length * 2 : length;
  const slice = data.subarray(offset + 2, Math.min(offset + 2 + bytes, data.length));
  return wide ? slice.toString("utf16le") : latin1ToString(slice);
}

function readLongString(data: Buffer, offset: number): string {
  if (offset + 3 > data.length) return "";
  const length = data.readUInt16LE(offset);
  const wide = (data.readUInt8(offset + 2) & 0x01) !== 0;
  const bytes = wide ? length * 2 : length;
  const slice = data.subarray(offset + 3, Math.min(offset + 3 + bytes, data.length));
  return wide ? slice.toString("utf16le") : latin1ToString(slice);
}

/** RK packs a float or a scaled integer into 32 bits. */
function decodeRk(value: number): number {
  const isInteger = (value & 0x02) !== 0;
  const isScaled = (value & 0x01) !== 0;

  let result: number;
  if (isInteger) {
    result = value >> 2;
    // The top bit is the sign in the 30-bit integer form.
    if (result & 0x20000000) result -= 0x40000000;
  } else {
    const bytes = Buffer.alloc(8);
    bytes.writeUInt32LE(value & 0xfffffffc, 4);
    result = bytes.readDoubleLE(0);
  }
  return isScaled ? result / 100 : result;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(10)));
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

/** Number formats Excel ships with that mean a date or a time. */
const BUILT_IN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
]);

/**
 * Which cell formats mean "this number is a date". Without this a scheduled
 * time comes through as 46202.1875 rather than a time anyone can read.
 */
function readDateFormats(all: Record_[]): Set<number> {
  const dateFormatIds = new Set(BUILT_IN_DATE_FORMATS);

  for (const record of all) {
    if (record.type !== REC.FORMAT || record.data.length < 4) continue;
    const id = record.data.readUInt16LE(0);
    if (looksLikeDateFormat(readLongString(record.data, 2))) dateFormatIds.add(id);
  }

  // XF records are referenced by index in the order they appear.
  const dateXfs = new Set<number>();
  let index = 0;
  for (const record of all) {
    if (record.type !== REC.XF) continue;
    if (record.data.length >= 4 && dateFormatIds.has(record.data.readUInt16LE(2))) dateXfs.add(index);
    index++;
  }
  return dateXfs;
}

function looksLikeDateFormat(format: string): boolean {
  // Strip quoted literals and colour or condition blocks before looking for
  // date letters, so "$"#,##0 does not read as a date because of its d.
  const bare = format
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "");
  return /[ymdhs]/i.test(bare) && !/^[^ymdhs]*$/i.test(bare);
}

function cell(value: number, xf: number, dateXfs: Set<number>): string {
  return dateXfs.has(xf) ? formatSerial(value) : formatNumber(value);
}

/** Excel counts days from 1899-12-30, and carries 1900 as a leap year. */
function formatSerial(serial: number): string {
  if (!Number.isFinite(serial) || serial < 0 || serial > 2_958_465) return formatNumber(serial);

  const days = Math.floor(serial);
  const fraction = serial - days;
  const ms = Math.round(fraction * 86_400_000);

  const date = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000 + ms);
  const pad = (n: number) => String(n).padStart(2, "0");

  const ymd = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const hms = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;

  if (days === 0) return hms;
  if (ms === 0) return ymd;
  return `${ymd} ${hms}`;
}
