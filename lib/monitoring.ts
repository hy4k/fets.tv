/**
 * The floor walk and the DVR check, on the exam's clock.
 *
 * Nothing starts until the first candidate's exam clock starts. From that
 * instant the day is cut into ten-minute windows and ninety-minute shifts,
 * both counted from the same moment, so a walk is never "late against the
 * wall clock" — it is due in the window it belongs to, and each window either
 * has a check in it or does not. That is the log.
 *
 * Pure functions, no React: the screen and the export read the same answer.
 */

export type CheckKind = "floor" | "dvr";

export type Check = {
  kind: CheckKind;
  walked_at: string;
  walked_by_name: string;
  note: string | null;
};

export type Window = {
  /** 1-based across the whole day. */
  n: number;
  /** 1-based. */
  shift: number;
  start: number;
  end: number;
  checks: Check[];
  status: "done" | "missed" | "open";
};

export type Track = {
  kind: CheckKind;
  windows: Window[];
  current: Window | null;
};

export type Day = {
  /** When the first exam clock started. Null means nothing has begun. */
  anchor: number | null;
  /** When the last candidate finished, if all have. The clock stops there. */
  finishedAt: number | null;
  shift: { n: number; start: number; end: number } | null;
  floor: Track;
  dvr: Track;
};

type Sitter = {
  exam_started_at: string | null;
  exam_finished_at: string | null;
  status?: string;
  completed_at?: string | null;
  signed_out_at?: string | null;
};

/**
 * The first exam start among these candidates, and the last finish once the
 * day is really over: everyone who is going to sit has sat and finished.
 * Somebody still waiting to start keeps the day open, however early the
 * first sitters finished; only a no-show is left out.
 */
export function dayBounds(candidates: Sitter[]) {
  // No-shows are out of it entirely, even one whose clock was started by
  // mistake: they neither start the day nor hold it open.
  const expected = candidates.filter((c) => c.status !== "no_show");
  const started = expected.filter((c) => c.exam_started_at);
  if (started.length === 0) return { anchor: null, finishedAt: null };
  const anchor = Math.min(...started.map((c) => new Date(c.exam_started_at!).getTime()));
  // Done means finished on the clock, or moved to completed / signed out by
  // hand — an override changes the status and leaves the timestamps empty.
  const allDone = expected.every(
    (c) =>
      (c.exam_started_at && c.exam_finished_at) ||
      c.status === "completed" ||
      c.status === "signed_out",
  );
  // Each person's end: the exam clock's finish, or — when moved on by hand,
  // which stamps these but not the clock — when they were completed or
  // signed out, whichever came first.
  const finishes = expected
    .map((c) => c.exam_finished_at ?? c.completed_at ?? c.signed_out_at ?? null)
    .filter((x): x is string => x !== null)
    .map((x) => new Date(x).getTime());
  const finishedAt = allDone ? (finishes.length ? Math.max(...finishes) : anchor) : null;
  return { anchor, finishedAt };
}

export function monitoringDay(input: {
  anchor: number | null;
  finishedAt: number | null;
  now: number;
  checks: Check[];
  walkMinutes: number;
  shiftMinutes: number;
}): Day {
  const { anchor, finishedAt, now, checks, walkMinutes, shiftMinutes } = input;
  const empty = (kind: CheckKind): Track => ({ kind, windows: [], current: null });
  if (anchor === null || now < anchor) {
    return { anchor, finishedAt, shift: null, floor: empty("floor"), dvr: empty("dvr") };
  }

  const W = walkMinutes * 60000;
  const S = shiftMinutes * 60000;
  // The last window is the one the day's end falls in, or the one now falls in.
  const stop = finishedAt !== null ? Math.min(finishedAt, now) : now;
  // A running day includes the window now falls in. A finished day ends at
  // the finish: finishing exactly on a boundary does not open one more.
  const count =
    finishedAt !== null && stop === finishedAt
      ? Math.max(1, Math.ceil((stop - anchor) / W))
      : Math.floor((stop - anchor) / W) + 1;

  const k = Math.floor((stop - anchor) / S);
  const shift = { n: k + 1, start: anchor + k * S, end: anchor + (k + 1) * S };

  const track = (kind: CheckKind): Track => {
    const mine = checks
      .filter((c) => c.kind === kind)
      .map((c) => ({ c, at: new Date(c.walked_at).getTime() }))
      // Nothing before the first exam, and nothing after the last finish —
      // a stale tab pressing late is not a check of a running hall.
      .filter((x) => x.at >= anchor && (finishedAt === null || x.at <= finishedAt))
      .sort((a, b) => a.at - b.at);

    const windows: Window[] = [];
    for (let i = 0; i < count; i++) {
      const start = anchor + i * W;
      const end = start + W;
      const inside = mine.filter((x) => x.at >= start && x.at < end).map((x) => x.c);
      const isLast = i === count - 1;
      const running = finishedAt === null && isLast;
      windows.push({
        n: i + 1,
        shift: Math.floor((start - anchor) / S) + 1,
        start,
        end,
        checks: inside,
        status: inside.length > 0 ? "done" : running ? "open" : "missed",
      });
    }
    return { kind, windows, current: finishedAt === null ? windows[windows.length - 1] : null };
  };

  return { anchor, finishedAt, shift, floor: track("floor"), dvr: track("dvr") };
}

/**
 * Whether the ninety minutes are up, or nearly, and nobody has moved yet.
 *
 * The boundary that matters is the one just ahead if it is within five
 * minutes, otherwise the one just behind. A rotation in the ten minutes
 * before that boundary counts as having handed over for it, so pressing it a
 * little early does not make the banner come straight back.
 */
export function handoverDue(input: {
  day: Day;
  now: number;
  /** When the person on the floor now took it over. */
  lastRotation: number | null;
  shiftMinutes: number;
}): { due: boolean; boundary: number | null; minutes: number | null } {
  const { day, now, lastRotation, shiftMinutes } = input;
  if (!day.shift || day.finishedAt !== null || lastRotation === null) {
    return { due: false, boundary: null, minutes: null };
  }
  const S = shiftMinutes * 60000;
  const soon = day.shift.end - now <= 5 * 60000;
  const boundary = soon ? day.shift.end : day.shift.start;
  // The first shift's start is the exam starting, not a handover.
  if (boundary === day.anchor) return { due: false, boundary: null, minutes: null };
  const due = lastRotation < boundary - 10 * 60000;
  // New blocks run to the end of the shift after the boundary, so the posts
  // board and this screen agree about when the next handover is.
  const minutes = Math.min(480, Math.max(15, Math.round((boundary + S - now) / 60000)));
  return { due, boundary, minutes };
}

/**
 * Minutes for blocks started now, so they end with the current shift — or,
 * in its last ten minutes, with the next one, since handoverDue counts a
 * rotation that close to the boundary as that boundary's handover.
 */
export function minutesToShiftEnd(day: Day, now: number) {
  if (!day.shift) return null;
  const S = day.shift.end - day.shift.start;
  const end = day.shift.end - now <= 10 * 60000 ? day.shift.end + S : day.shift.end;
  return Math.min(480, Math.max(15, Math.round((end - now) / 60000)));
}

export function countdown(ms: number) {
  const over = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const body = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
  return over ? `+${body}` : body;
}

type Holder = { post_kind: string; profile_name: string; started_at: string; ended_at: string | null };

/** Who held the post of this kind at an instant, from the duty blocks. */
export function holderAt(blocks: Holder[], postKind: string, at: number) {
  const b = blocks.find(
    (x) =>
      x.post_kind === postKind &&
      new Date(x.started_at).getTime() <= at &&
      (x.ended_at === null || new Date(x.ended_at).getTime() > at),
  );
  return b?.profile_name ?? "";
}

/**
 * The day's log as CSV: one row per ten-minute window per track, with the
 * shift it fell in, who held the post, and when it was checked.
 *
 * A window with two checks gives two rows; a missed one gives one row saying
 * so. Spreadsheet-safe: every field quoted, and a leading = + - @ neutralised
 * so a note cannot become a formula.
 */
export function monitoringCsv(input: {
  day: Day;
  date: string;
  timezone: string;
  blocks: Holder[];
}) {
  const { day, date, timezone, blocks } = input;
  const time = (ms: number) =>
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(
      new Date(ms),
    );
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const header = ["Date", "Shift", "Shift time", "Track", "Window", "Window time", "On post", "Status", "Checked at", "Checked by", "Note"];
  const rows: (string | number)[][] = [];
  if (day.anchor === null) return [header].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

  const S = (day.shift ? day.shift.end - day.shift.start : 0) || 90 * 60000;
  for (const track of [day.floor, day.dvr]) {
    const label = track.kind === "floor" ? "Floor walk" : "DVR";
    const postKind = track.kind === "floor" ? "lab" : "cctv";
    for (const w of track.windows) {
      const shiftStart = day.anchor + (w.shift - 1) * S;
      const base = [
        date,
        w.shift,
        `${time(shiftStart)}-${time(shiftStart + S)}`,
        label,
        w.n,
        `${time(w.start)}-${time(w.end)}`,
        holderAt(blocks, postKind, w.start),
      ];
      if (w.checks.length === 0) {
        rows.push([...base, w.status === "open" ? "Open" : "Missed", "", "", ""]);
      } else {
        for (const c of w.checks) {
          rows.push([...base, "Done", time(new Date(c.walked_at).getTime()), c.walked_by_name, c.note ?? ""]);
        }
      }
    }
  }
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
