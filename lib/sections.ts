import type { Candidate, CandidateSection, ProgrammeSection, SectionKind } from "@/lib/types";

/**
 * One part of an exam, with both answers side by side: where the plan says it
 * should be, and where it actually was.
 *
 * The estimate is built from the candidate's own start, not from a wall clock,
 * because everybody starts at a different minute. The actual comes only from a
 * confirmation somebody made — the console never guesses it, since a guess in
 * the Center Problem Report is worse than a blank.
 */
export type SectionView = {
  position: number;
  name: string;
  minutes: number;
  kind: SectionKind;
  /** Milliseconds since the epoch, from the candidate's own start. */
  estimatedStart: number;
  estimatedEnd: number;
  confirmed: CandidateSection | null;
  actualStart: number | null;
  /** The next part beginning, or — for the last one — the exam finishing. */
  actualEnd: number | null;
  /** How late it really began, in minutes. Negative means early. */
  driftMinutes: number | null;
  /**
   * False when the plan no longer has this part but somebody observed it. The
   * observation stays visible: it is the record, and dropping it would hide a
   * part the database still counts.
   */
  inPlan: boolean;
};

/**
 * Lays the plan over one candidate's day.
 *
 * Confirmations win over the plan for their own name and length: a part that
 * was observed keeps the wording it was observed under, even if Setup has been
 * edited since.
 */
export function sectionsFor(
  candidate: Candidate,
  plan: ProgrammeSection[],
  confirmations: CandidateSection[],
): SectionView[] {
  if (!candidate.exam_started_at) return [];

  const start = new Date(candidate.exam_started_at).getTime();
  const mine = confirmations
    .filter((c) => c.candidate_id === candidate.id)
    .sort((a, b) => a.position - b.position);

  const finished = candidate.exam_finished_at ? new Date(candidate.exam_finished_at).getTime() : null;

  // Every position either side knows about. An admin who removes a part after
  // somebody has sat it does not thereby unsay what was observed.
  const planAt = new Map(plan.map((p) => [p.position, p]));
  const seenAt = new Map(mine.map((c) => [c.position, c]));
  const positions = [...new Set([...planAt.keys(), ...seenAt.keys()])].sort((a, b) => a - b);

  let cursor = start;

  const views = positions.map((position) => {
    const section = planAt.get(position) ?? null;
    const confirmed = seenAt.get(position) ?? null;
    const minutes = confirmed?.minutes ?? section!.minutes;

    const estimatedStart = cursor;
    const estimatedEnd = cursor + minutes * 60000;
    cursor = estimatedEnd;

    const actualStart = confirmed ? new Date(confirmed.started_at).getTime() : null;
    const actualEnd = confirmed?.ended_at ? new Date(confirmed.ended_at).getTime() : null;

    return {
      position,
      name: confirmed?.name ?? section!.name,
      minutes,
      kind: (confirmed?.kind ?? section!.kind) as SectionKind,
      estimatedStart,
      estimatedEnd,
      confirmed,
      actualStart,
      actualEnd,
      driftMinutes: actualStart === null ? null : Math.round((actualStart - estimatedStart) / 60000),
      inPlan: section !== null,
    };
  });

  // The last part that was confirmed has no next part to close it, so the exam
  // finishing is its end. Nothing else can honestly fill that in.
  const lastOpen = [...views].reverse().find((v) => v.actualStart !== null && v.actualEnd === null);
  if (lastOpen && finished !== null) lastOpen.actualEnd = finished;

  return views;
}

/**
 * Which part they are in now.
 *
 * A confirmation that is open beats the clock — somebody saw it. Only when
 * nothing has been confirmed does this fall back to where the plan says they
 * ought to be, and the caller is expected to show that as an estimate.
 */
export function currentSection(views: SectionView[], now: number) {
  const open = [...views].reverse().find((v) => v.actualStart !== null && v.actualEnd === null);
  if (open) return { section: open, confirmed: true as const };

  const byClock = views.find((v) => now >= v.estimatedStart && now < v.estimatedEnd);
  if (byClock) return { section: byClock, confirmed: false as const };

  return null;
}
