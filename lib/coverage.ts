import type { StaffDay } from "./types.ts";
// Relative and with the extension so the plain node test runner resolves this
// at runtime; the `@/` alias only exists inside the bundler.
import { todayInZone } from "./format.ts";

/** In is the absence of a row; the other two are recorded. */
export type DayState = "in" | "off" | "half";

/** One column of the week grid. */
export type CoverageDay = {
  /** YYYY-MM-DD, the centre's own calendar date. */
  date: string;
  /** "Mon", "Tue" … */
  weekday: string;
  dayOfMonth: number;
  isToday: boolean;
  /** Already gone. Still editable — a rota is corrected as often as planned. */
  isPast: boolean;
  /** Everybody's answer for this day, by profile id. */
  states: Record<string, DayState>;
  inCount: number;
  halfCount: number;
  offCount: number;
  /** How many people the day needs: one per active post. */
  needs: number;
  /**
   * ok      — enough people in for a full day.
   * thin    — enough bodies, but only because a half day is counted.
   * short   — not enough people at all, however you count them.
   */
  tone: "ok" | "thin" | "short";
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A calendar date as milliseconds, with no timezone in it at all. */
function dayMs(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

function dayString(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The Monday on or before a date.
 *
 * Calendar arithmetic is done on UTC midnights rather than on real instants,
 * because a week grid has no time of day in it and doing it any other way
 * makes the grid shift by a day for half the year.
 */
export function mondayOf(date: string) {
  const ms = dayMs(date);
  const dow = new Date(ms).getUTCDay();
  return dayString(ms - ((dow + 6) % 7) * 86400000);
}

/** The same weekday, a given number of weeks away. */
export function shiftWeeks(date: string, weeks: number) {
  return dayString(dayMs(date) + weeks * 7 * 86400000);
}

/**
 * The seven days from a Monday, with everybody's answer on each.
 *
 * The centre stores only the exceptions, so anybody without a row is in. That
 * is what makes an untouched week read as a full week rather than as an empty
 * one, which for a three-person centre is the truth.
 */
export function coverageWeek(input: {
  staff: { id: string; name: string }[];
  staffDays: StaffDay[];
  /** One per post that has to be manned. */
  needs: number;
  timezone: string;
  /** Any date in the week; the Monday is worked out from it. */
  weekOf: string;
  now?: number;
}): CoverageDay[] {
  const monday = mondayOf(input.weekOf);
  const today = todayInZone(input.timezone, new Date(input.now ?? Date.now()));

  // One lookup for the whole week rather than a scan per cell.
  const byKey = new Map<string, DayState>();
  for (const row of input.staffDays) {
    if (row.profile_id) byKey.set(`${row.profile_id}|${row.on_date}`, row.state);
  }

  return Array.from({ length: 7 }, (_, i) => {
    const date = dayString(dayMs(monday) + i * 86400000);

    const states: Record<string, DayState> = {};
    let inCount = 0;
    let halfCount = 0;
    let offCount = 0;

    for (const person of input.staff) {
      const state = byKey.get(`${person.id}|${date}`) ?? "in";
      states[person.id] = state;
      if (state === "in") inCount++;
      else if (state === "half") halfCount++;
      else offCount++;
    }

    return {
      date,
      weekday: WEEKDAYS[new Date(dayMs(date)).getUTCDay()],
      dayOfMonth: Number(date.slice(8)),
      isToday: date === today,
      isPast: date < today,
      states,
      inCount,
      halfCount,
      offCount,
      needs: input.needs,
      tone:
        inCount >= input.needs
          ? "ok"
          : inCount + halfCount >= input.needs
            ? "thin"
            : "short",
    };
  });
}

/** What comes next when the cell is tapped: in → off → half → in. */
export function nextState(state: DayState): DayState {
  return state === "in" ? "off" : state === "off" ? "half" : "in";
}

/**
 * The days still to come that cannot cover themselves.
 *
 * Named separately from the grid because the sentence above it — "Tue and Wed
 * are short" — is the whole reason to open the screen, and it should not be
 * something the reader has to assemble by scanning seven columns. Days already
 * gone are left out: nothing can be done about Monday on Wednesday.
 */
export function shortDays(week: CoverageDay[]) {
  return week.filter((d) => !d.isPast && d.tone === "short");
}

/**
 * Days that only reach the number because a half day is counted.
 *
 * Kept apart from the short ones because calling them short is untrue, and a
 * warning that overstates itself is one people learn to wave away.
 */
export function thinDays(week: CoverageDay[]) {
  return week.filter((d) => !d.isPast && d.tone === "thin");
}

/**
 * How much of the rota travels in the snapshot: five weeks back, twelve on.
 *
 * Enough to page the grid a couple of months either way without another round
 * trip, and far short of the year the database will accept, so a full history
 * never rides along on a refresh that happens every time anybody presses
 * anything.
 *
 * It lives here rather than beside the fetches because the server layout calls
 * it too, and every export of a "use client" module is a client reference that
 * the server cannot call.
 */
export function weekWindow(now: Date = new Date()) {
  const day = 86400000;
  return {
    from: dayString(now.getTime() - 35 * day),
    to: dayString(now.getTime() + 84 * day),
  };
}

/**
 * Which weeks the grid may show, as offsets from this week.
 *
 * Only weeks lying wholly inside the loaded window count. Outside it the
 * snapshot simply has no rows, so every cell would read "in" and the screen
 * would cheerfully report a week as covered that nobody has planned — the one
 * lie this screen must never tell.
 */
export function weekRange(today: string, window: { from: string; to: string }) {
  const week = 7 * 86400000;
  const monday = dayMs(mondayOf(today));
  return {
    min: Math.ceil((dayMs(window.from) - monday) / week),
    max: Math.floor((dayMs(window.to) - 6 * 86400000 - monday) / week),
  };
}

/** "Wed 23", "Wed 23 and Thu 24", "Wed 23, Thu 24 and Fri 25". */
export function listDays(days: CoverageDay[]) {
  const names = days.map((d) => `${d.weekday} ${d.dayOfMonth}`);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
