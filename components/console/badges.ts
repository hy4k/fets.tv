"use client";

import { useConsole } from "@/lib/console-data";
import type { StepKey } from "@/lib/nav";

/**
 * How many things want attention, per step. Shared by the top bar (summed per
 * place) and the tabs under the hero (one each), so the two never disagree.
 */
export function useStepBadges(): Partial<Record<StepKey, number>> {
  const { candidates, notice, openBreaks, incidents, rules } = useConsole();

  // The admin room's work: waiting to be called, at the gate, ready for a seat.
  const waiting = candidates.filter(
    (c) =>
      c.status === "waiting" ||
      c.status === "frisking" ||
      c.status === "biometrics" ||
      (c.status === "assigned" && !c.workstation_id),
  ).length;
  const testing = candidates.filter((c) => c.exam_started_at && !c.exam_finished_at).length;
  const openIncidents = incidents.filter((i) => !i.resolved_at).length;

  // Only a count to act on when keys are required; optional keys raise no alarm.
  const keyless = rules.locker_key_required
    ? candidates.filter(
        (c) => c.check_in_at && !c.locker_key && !["completed", "signed_out", "no_show"].includes(c.status),
      ).length
    : 0;

  return {
    // Checked in without a key. Calls are the admin room's now, not the desk's.
    checkin: keyless,
    security: waiting,
    live: testing + openBreaks.length,
    incidents: openIncidents,
    messages: notice ? 1 : 0,
  };
}

/** Only these count toward the number on a place: things somebody must act on. */
export const URGENT: StepKey[] = ["checkin", "security", "incidents"];
