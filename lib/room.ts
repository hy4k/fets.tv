import type { BoardFloor, Candidate, ExamProgramme, Workstation } from "./types.ts";

/**
 * The room at rest, as the TV shows it: exams running now and the seats taken
 * and free. The database works out the same for the hall TV; this is the
 * console's copy, for its previews.
 */
export function roomFloor(
  candidates: Candidate[],
  workstations: Workstation[],
  programmes: ExamProgramme[],
): BoardFloor {
  const seats = workstations.filter((w) => w.lab_id && w.status !== "fault");
  const running = new Map<string, number>();
  for (const c of candidates) {
    if (!c.exam_started_at || c.exam_finished_at || ["completed", "signed_out", "no_show"].includes(c.status)) continue;
    const name = programmes.find((p) => p.id === c.programme_id)?.name ?? c.live_exam_name ?? "Exam";
    running.set(name, (running.get(name) ?? 0) + 1);
  }
  return {
    exams: [...running].map(([name, testing]) => ({ name, testing })).sort((a, b) => b.testing - a.testing),
    seats_total: seats.length,
    seats_in_use: seats.filter((w) => w.status === "assigned" || w.status === "active").length,
    seats_free: seats.filter((w) => w.status === "free").length,
  };
}
