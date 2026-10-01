/**
 * The Lab's duty timer: one long run from the first exam start to the last
 * expected finish, with a DVR check due every six minutes and a floor walk
 * every ten, both counted from that first start.
 *
 * Nothing is logged here. The page only shows what is due next; the export at
 * the end of the day lists every mark with whoever recorded a check near it,
 * leaving the name blank where nobody did, so it can be signed on paper.
 *
 * Pure functions, no React: the banner and the export read the same answer.
 */

export const DVR_MINUTES = 6;
export const WALK_MINUTES = 10;

export type DutyKind = "dvr" | "floor";

type Sitter = {
  status?: string;
  exam_started_at: string | null;
  exam_expected_end: string | null;
  exam_duration_minutes?: number | null;
};

/**
 * Start: the first exam clock started. End: the latest expected finish among
 * those started. A no-show never counts, even one started by mistake.
 */
export function dutySpan(candidates: Sitter[]): { start: number | null; end: number | null } {
  const started = candidates.filter((c) => c.status !== "no_show" && c.exam_started_at);
  if (started.length === 0) return { start: null, end: null };
  const starts = started.map((c) => new Date(c.exam_started_at!).getTime());
  const start = Math.min(...starts);
  const ends = started
    .map((c, i) =>
      c.exam_expected_end
        ? new Date(c.exam_expected_end).getTime()
        : c.exam_duration_minutes
          ? starts[i] + c.exam_duration_minutes * 60000
          : null,
    )
    .filter((x): x is number => x !== null && Number.isFinite(x));
  const end = ends.length ? Math.max(start, ...ends) : null;
  return { start, end };
}

/** Every mark after the start, up to and including the end. */
export function marks(start: number, end: number, everyMinutes: number): number[] {
  const step = everyMinutes * 60000;
  const out: number[] = [];
  for (let t = start + step; t <= end; t += step) out.push(t);
  return out;
}

/** The next mark still ahead of now, or null once the run is over. */
export function nextMark(start: number, end: number, everyMinutes: number, now: number) {
  const step = everyMinutes * 60000;
  if (now < start) return { n: 1, at: start + step, left: start + step - now };
  const n = Math.floor((now - start) / step) + 1;
  const at = start + n * step;
  if (at > end) return null;
  return { n, at, left: at - now };
}

/** Two digits a side: 05:42. Past an hour the minutes simply keep counting. */
export function twoDigit(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export type DutyCheck = { kind: DutyKind; walked_at: string; walked_by_name: string };

/**
 * The day as CSV: one row per mark per track. A check counts for the mark it
 * is nearest to (within half an interval either side). Spreadsheet-safe:
 * every field quoted, and a leading = + - @ neutralised.
 */
export function dutyLogCsv(input: {
  start: number | null;
  end: number | null;
  checks: DutyCheck[];
  date: string;
  timezone: string;
}) {
  const { start, end, checks, date, timezone } = input;
  const time = (ms: number) =>
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(
      new Date(ms),
    );
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const header = ["Date", "Track", "Mark", "Due at", "Checked at", "Staff name", "Signature"];
  const rows: (string | number)[][] = [];
  if (start !== null && end !== null) {
    for (const [kind, every, label] of [
      ["dvr", DVR_MINUTES, "DVR check"],
      ["floor", WALK_MINUTES, "Floor walk"],
    ] as const) {
      const half = (every * 60000) / 2;
      const mine = checks.filter((c) => c.kind === kind).map((c) => ({ c, at: new Date(c.walked_at).getTime() }));
      marks(start, end, every).forEach((at, i) => {
        const near = mine
          .filter((x) => x.at >= at - half && x.at < at + half)
          .sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];
        rows.push([date, label, i + 1, time(at), near ? time(near.at) : "", near?.c.walked_by_name ?? "", ""]);
      });
    }
  }
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
