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

  const ordered = [...plan].sort((a, b) => a.position - b.position);
  const finished = candidate.exam_finished_at ? new Date(candidate.exam_finished_at).getTime() : null;

  let cursor = start;

  const views = ordered.map((section) => {
    const confirmed = mine.find((c) => c.position === section.position) ?? null;
    const estimatedStart = cursor;
    const estimatedEnd = cursor + (confirmed?.minutes ?? section.minutes) * 60000;
    cursor = estimatedEnd;

    const actualStart = confirmed ? new Date(confirmed.started_at).getTime() : null;
    const actualEnd = confirmed?.ended_at ? new Date(confirmed.ended_at).getTime() : null;

    return {
      position: section.position,
      name: confirmed?.name ?? section.name,
      minutes: confirmed?.minutes ?? section.minutes,
      kind: (confirmed?.kind ?? section.kind) as SectionKind,
      estimatedStart,
      estimatedEnd,
      confirmed,
      actualStart,
      actualEnd,
      driftMinutes: actualStart === null ? null : Math.round((actualStart - estimatedStart) / 60000),
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
