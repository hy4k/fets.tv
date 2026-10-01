import type { Candidate, CandidateStatus } from "@/lib/types";

/** The 11 operational stages from the MVP brief, in order. */
export const STAGE_ORDER: CandidateStatus[] = [
  "scheduled",
  "arrived",
  "id_checked",
  "waiting",
  "frisking",
  "biometrics",
  "assigned",
  "lab_entry",
  "testing",
  "completed",
  "signed_out",
];

export const STAGE_LABELS: Record<CandidateStatus, string> = {
  scheduled: "Scheduled",
  arrived: "Arrived",
  id_checked: "ID checked",
  waiting: "Waiting",
  frisking: "Frisking",
  biometrics: "Biometrics",
  assigned: "Assigned",
  lab_entry: "Lab entry",
  testing: "Testing",
  completed: "Completed",
  signed_out: "Sign out",
  no_show: "No show",
};

export function fullName(c: Pick<Candidate, "first_name" | "last_name">) {
  return `${c.first_name} ${c.last_name}`.trim();
}

/**
 * How a candidate is known at the desk and on the TV: the confirmation number
 * the exam provider gave them. The internal FETS token is only a fallback for
 * the rare walk-in with no number.
 */
export function refOf(c: Pick<Candidate, "roster_number" | "public_token">) {
  return c.roster_number?.trim() || c.public_token;
}


/** How many called candidates may be on their way to the gate at once. */
export const MAX_ON_THE_WAY = 5;

/** Statuses that still need the front desk's check-in. */
export const WAITING_TO_CHECK_IN = ["scheduled", "arrived", "id_checked"];

/**
 * Somebody who joined today's list after it was loaded: a walk-in or
 * emergency added by hand, or a late booking brought across from fets.live.
 * They carry the day's last slot, so in time order they sink to the bottom of a
 * long list, which is exactly where a check-in gets missed.
 */
export function joinedLate(
  c: Pick<Candidate, "created_at" | "roster_number">,
  session: { created_at: string } | null,
) {
  if (c.roster_number?.startsWith("MANUAL-")) return true;
  if (!session) return false;
  // A minute's grace: an import or sync writes its rows just after the day opens.
  return Date.parse(c.created_at) - Date.parse(session.created_at) > 60_000;
}

/**
 * The list with anybody who joined late and is still waiting to check in
 * lifted to the top, newest first. Everyone else keeps the order they had.
 */
export function lateFirst<T extends Pick<Candidate, "created_at" | "roster_number" | "status">>(
  list: T[],
  session: { created_at: string } | null,
): T[] {
  const late = list
    .filter((c) => WAITING_TO_CHECK_IN.includes(c.status) && joinedLate(c, session))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  if (late.length === 0) return list;
  const lifted = new Set(late);
  return [...late, ...list.filter((c) => !lifted.has(c))];
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function clockAt(iso: string | null | undefined, timezone: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso));
}

export function sinceLabel(iso: string, now: number = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

type Chip = { label: string; className: string };

export function statusChip(c: Candidate): Chip {
  if (c.status === "no_show") return { label: "No show", className: "bg-rust/15 text-rust" };
  if (c.called_at) return { label: "Called", className: "bg-gold/15 text-gold" };

  switch (c.status) {
    case "scheduled":
      return { label: "Scheduled", className: "bg-panel-soft text-fg-muted" };
    case "arrived":
    case "id_checked":
      return { label: "ID checked", className: "bg-gold/10 text-gold" };
    case "waiting":
      return { label: "Checked in", className: "bg-mint/15 text-mint" };
    // Two different things now that the desk signs people out: finished the
    // exam but still in the building, and actually gone.
    case "completed":
      return { label: "Finished", className: "bg-mint/15 text-mint" };
    case "signed_out":
      return { label: "Gone", className: "bg-panel-soft text-fg-faint" };
    default:
      return { label: "Inside", className: "bg-iris/15 text-iris" };
  }
}

export function isInHall(c: Candidate) {
  return !["scheduled", "arrived", "completed", "signed_out", "no_show"].includes(c.status);
}

/**
 * The staff laptop's own timezone is not trustworthy, and the exam clock is a
 * legal record, so an HH:MM typed on the floor is read in the center's
 * timezone rather than the browser's. Two passes settle any DST boundary.
 */
function zoneOffsetMs(instant: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date(instant))
    .reduce<Record<string, number>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = Number(p.value);
      return acc;
    }, {});

  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour === 24 ? 0 : parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instant;
}

/** The current wall-clock time at the center, as "HH:MM". */
export function nowInZone(timezone: string) {
  return clockAt(new Date().toISOString(), timezone);
}

/** Reads "HH:MM" as today's wall-clock time at the center and returns the instant. */
export function instantFromZonedTime(hhmm: string, timezone: string, reference: Date = new Date()) {
  const [h, m] = hhmm.split(":").map(Number);
  const offset = zoneOffsetMs(reference.getTime(), timezone);
  const localDay = new Date(reference.getTime() + offset);

  const guess = Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), localDay.getUTCDate(), h, m);
  const settled = guess - zoneOffsetMs(guess - offset, timezone);
  return new Date(settled);
}

/**
 * Today's date at the center, as "YYYY-MM-DD".
 *
 * An exam day belongs to the centre, not to UTC. Asia/Kolkata runs five and a
 * half hours ahead, so between local midnight and 05:30 the UTC date is still
 * yesterday, and a roster started in that window would be filed against the
 * wrong day unless somebody noticed.
 */
/**
 * Whether an instant falls on the centre's current day.
 *
 * "Last walked 17:22" at nine the next morning is not an answer, it is
 * yesterday's answer wearing today's clothes, so anything that reports on the
 * day has to ask this first.
 */
export function isToday(iso: string, timezone: string, now: number = Date.now()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return false;
  return todayInZone(timezone, at) === todayInZone(timezone, new Date(now));
}

export function todayInZone(timezone: string, reference: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

/**
 * Whether somebody is testing now: their exam clock is running and nobody has
 * moved them on. An override to completed, signed out or no-show changes the
 * status without stopping the clock, so the status has the last word.
 */
export function isTesting(c: Pick<Candidate, "exam_started_at" | "exam_finished_at" | "status">) {
  return !!c.exam_started_at && !c.exam_finished_at && !["completed", "signed_out", "no_show"].includes(c.status);
}
