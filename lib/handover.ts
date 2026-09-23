import type {
  Candidate,
  CandidateBreak,
  CandidateMaterial,
  Incident,
  MaterialKind,
  Walkthrough,
  Workstation,
} from "./types.ts";
// Relative and with the extension so the plain node test runner resolves
// these at runtime; the `@/` alias only exists inside the bundler.
import { stillHeld } from "./types.ts";
import { fullName, isInHall, isToday } from "./format.ts";

/** One candidate mid-exam, with the clock the next person inherits. */
export type SeatedCandidate = {
  id: string;
  token: string;
  name: string;
  seat: string | null;
  /** When their exam is due to end, in epoch milliseconds. Null if unknown. */
  endsAt: number | null;
  onBreak: boolean;
  /** Since when, in epoch milliseconds, for somebody on a break. */
  breakSince: number | null;
};

/** Something handed out and not yet back. */
export type MaterialOut = {
  token: string;
  name: string;
  label: string;
  count: number;
};

/**
 * The state of the room at the moment a post changes hands.
 *
 * This is deliberately a plain function over the snapshot rather than a query.
 * A handover happens at the worst possible moment — somebody is waiting, a
 * candidate is mid-section — and a screen that has to wait for the network is a
 * screen that gets skipped. Everything here is already loaded.
 */
export type HandoverState = {
  seated: SeatedCandidate[];
  /** Through the door, not yet sitting: checked in, frisked, waiting for a seat. */
  inProcess: number;
  /** Rostered and not here yet. */
  notArrived: number;
  /** Finished and still to be signed out — the queue that forms at the desk. */
  awaitingSignOut: number;
  openIncidents: Incident[];
  materialsOut: MaterialOut[];
  lastWalk: Walkthrough | null;
  /** How overdue the floor walk is, in minutes. Zero or less means in hand. */
  walkOverdueMinutes: number | null;
};

export function handoverState(
  input: {
    candidates: Candidate[];
    incidents: Incident[];
    materials: CandidateMaterial[];
    materialKinds: MaterialKind[];
    openBreaks: CandidateBreak[];
    walkthroughs: Walkthrough[];
    workstations: Workstation[];
    walkthroughMinutes: number;
    timezone: string;
  },
  now: number,
): HandoverState {
  const { candidates, incidents, materials, materialKinds, openBreaks, walkthroughs, workstations } =
    input;

  const kindLabel = new Map(materialKinds.map((k) => [k.code, k.label]));

  const seatOf = new Map(workstations.map((w) => [w.id, w.seat_code]));
  const breakOf = new Map(openBreaks.map((b) => [b.candidate_id, b]));

  const seated = candidates
    .filter((c) => c.exam_started_at && !c.exam_finished_at)
    .map<SeatedCandidate>((c) => {
      const brk = breakOf.get(c.id) ?? null;
      // Both instants are kept as numbers, and a timestamp that will not parse
      // becomes null rather than an Invalid Date. Rendering one of those throws
      // and takes the whole screen with it.
      const since = brk ? new Date(brk.started_at).getTime() : NaN;
      const expected = c.exam_expected_end
        ? new Date(c.exam_expected_end).getTime()
        : c.exam_duration_minutes
          ? new Date(c.exam_started_at!).getTime() + c.exam_duration_minutes * 60000
          : null;

      return {
        id: c.id,
        token: c.public_token,
        name: fullName(c),
        seat: c.workstation_id ? (seatOf.get(c.workstation_id) ?? null) : null,
        endsAt: expected !== null && Number.isFinite(expected) ? expected : null,
        onBreak: brk !== null,
        breakSince: Number.isFinite(since) ? since : null,
      };
    })
    // Whoever is closest to finishing is the one the next person deals with
    // first, so that is the order. An unknown end goes last.
    .sort((a, b) => (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity));

  const byId = new Map(candidates.map((c) => [c.id, c]));

  const materialsOut = materials
    .map((m) => ({ m, held: stillHeld(m) }))
    .filter((x) => x.held > 0)
    .map<MaterialOut>((x) => {
      const c = byId.get(x.m.candidate_id);
      return {
        token: c?.public_token ?? "—",
        name: c ? fullName(c) : "Unknown",
        // The centre's own word for it, not the column value. "other" carries
        // its own label; anything else is named by its kind.
        label: x.m.label || kindLabel.get(x.m.kind) || x.m.kind,
        count: x.held,
      };
    })
    .sort((a, b) => a.token.localeCompare(b.token) || a.label.localeCompare(b.label));

  // Only today's walks. The snapshot holds the last eighty whenever they
  // happened, so the first handover of a new morning would otherwise report
  // yesterday's final walk as the last one, hours overdue, instead of saying
  // plainly that nobody has walked the floor yet.
  const lastWalk =
    walkthroughs.find((w) => isToday(w.walked_at, input.timezone, now)) ?? null;
  const walkOverdueMinutes = lastWalk
    ? Math.floor((now - new Date(lastWalk.walked_at).getTime()) / 60000) - input.walkthroughMinutes
    : null;

  return {
    seated,
    inProcess: candidates.filter((c) => isInHall(c) && !c.exam_started_at).length,
    notArrived: candidates.filter((c) => c.status === "scheduled").length,
    awaitingSignOut: candidates.filter((c) => c.status === "completed").length,
    openIncidents: incidents
      .filter((i) => !i.resolved_at)
      .sort((a, b) => b.started_at.localeCompare(a.started_at)),
    materialsOut,
    lastWalk,
    walkOverdueMinutes,
  };
}

/**
 * Whether there is anything at all to hand over.
 *
 * A quiet room is a legitimate answer and should read as one, rather than as
 * four empty headings the next person learns to scroll past.
 */
export function isQuiet(s: HandoverState) {
  return (
    s.seated.length === 0 &&
    s.openIncidents.length === 0 &&
    s.materialsOut.length === 0 &&
    s.inProcess === 0 &&
    s.awaitingSignOut === 0
  );
}
