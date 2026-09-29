/**
 * The centre's wording for a Center Problem Report entry.
 *
 * Every entry the vendors want is two paragraphs — Additional Information,
 * then Resolution — and FETS files the same kinds of thing again and again in
 * the same words. So each kind is kept here once, as the centre wrote it, with
 * the parts that change (a time, a count, a device) left as fields. The screen
 * fills the fields from the day where it can — when somebody arrived, when
 * they were due — and a person checks and adds what only they saw.
 */

export type CprField = {
  key: string;
  label: string;
  /** "time" is a clock time on the day ("09:45"); "number" a count; "text" words. */
  kind: "time" | "number" | "text";
  /** What goes in when nothing is known. */
  fallback: string;
};

export type CprFormat = {
  key: string;
  title: string;
  /** The incident kind it is filed as, for the report's categories. */
  incident: "candidate" | "conduct" | "power" | "workstation" | "delivery" | "other";
  severity: "minor" | "major" | "critical";
  /** Whether this one is about a single candidate, so the screen offers a pick. */
  candidate: boolean;
  fields: CprField[];
  additional: (v: Values) => string;
  resolution: (v: Values) => string;
};

export type Values = Record<string, string>;

const t = (key: string, label: string, fallback = "[time]"): CprField => ({ key, label, kind: "time", fallback });
const n = (key: string, label: string, fallback = "[number]"): CprField => ({ key, label, kind: "number", fallback });
const x = (key: string, label: string, fallback: string): CprField => ({ key, label, kind: "text", fallback });

/** "09:45" → "09:45 AM", the way the reports write it. Anything else as it is. */
export function clock12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h = Number(m[1]);
  if (h > 23) return hhmm;
  return `${String(h % 12 || 12).padStart(2, "0")}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

function val(f: CprField, v: Values): string {
  const raw = (v[f.key] ?? "").trim();
  if (!raw) return f.fallback;
  return f.kind === "time" ? clock12(raw) : raw;
}

/** The fields' values as they read in the sentence. */
function words(format: { fields: CprField[] }, v: Values): Values {
  return Object.fromEntries(format.fields.map((f) => [f.key, val(f, v)]));
}

const FORMATS_RAW: CprFormat[] = [
  {
    key: "late_able",
    title: "Late arrival (able to test)",
    incident: "candidate",
    severity: "minor",
    candidate: true,
    fields: [t("arrived", "Arrived at"), t("scheduled", "Scheduled for"), n("late", "Minutes late")],
    additional: (w) =>
      `At ${w.arrived}, the candidate arrived for their scheduled ${w.scheduled} exam appointment. The candidate arrived ${w.late} minutes late.`,
    resolution: () =>
      "Because the candidate arrived within the allowable grace period and an open workstation was available without disrupting other scheduled appointments, the TCA completed all security and check-in procedures. The candidate was successfully admitted and permitted to test per client practice.",
  },
  {
    key: "late_unable",
    title: "Late arrival (unable to test)",
    incident: "candidate",
    severity: "major",
    candidate: true,
    fields: [t("arrived", "Arrived at"), t("scheduled", "Scheduled for"), n("late", "Minutes late")],
    additional: (w) =>
      `At ${w.arrived}, the candidate arrived for their scheduled ${w.scheduled} exam appointment. The candidate arrived ${w.late} minutes late, exceeding the allowable grace period for late arrival.`,
    resolution: () =>
      "The TCA informed the candidate that they could not be admitted due to arriving beyond the permissible time limit. The candidate was not permitted to test and was directed to contact the exam sponsor regarding rescheduling and fee policies.",
  },
  {
    key: "name_mismatch",
    title: "Name mismatch (ID and roster)",
    incident: "candidate",
    severity: "minor",
    candidate: true,
    fields: [
      t("at", "At"),
      t("scheduled", "Scheduled for"),
      x("id_name", "Name on the ID", "[name on ID]"),
      x("roster_name", "Name on the roster", "[name on roster]"),
    ],
    additional: (w) =>
      `At ${w.at}, during security check-in for a ${w.scheduled} scheduled appointment, the name on the candidate's identification (${w.id_name}) did not match the name on the appointment roster (${w.roster_name}).`,
    resolution: () =>
      "The TCA verified the candidate's identity against the original, valid photo identification and the appointment details. The discrepancy was documented, and the candidate was admitted and permitted to test per client practice.",
  },
  {
    key: "missing_id",
    title: "Missing / unacceptable ID",
    incident: "candidate",
    severity: "major",
    candidate: true,
    fields: [
      t("at", "At"),
      t("scheduled", "Scheduled for"),
      x("problem", "What was presented", "a driver's license that was expired"),
    ],
    additional: (w) =>
      `At ${w.at}, during security check-in for a ${w.scheduled} scheduled appointment, the candidate presented ${w.problem}. The candidate did not possess any other original, valid, unexpired government-issued photo identification required by client regulations.`,
    resolution: () =>
      "The TCA informed the candidate of the client's mandatory ID requirements. Because the candidate could not provide an acceptable ID before the check-in window closed, they were denied admission to the testing room and instructed to contact their exam sponsor for rescheduling policies.",
  },
  {
    key: "misconduct",
    title: "Candidate misconduct",
    incident: "conduct",
    severity: "critical",
    candidate: true,
    fields: [
      t("at", "At"),
      x("observed", "What was observed", "accessing an unauthorized mobile device underneath their workstation desk"),
      x("item", "Item confiscated", "the unauthorized electronic device"),
      x("escalated", "Escalated to", "the vendor's security team and the exam sponsor"),
    ],
    additional: (w) =>
      `At ${w.at}, during routine testing room monitoring, the candidate was observed ${w.observed}. The TCA, accompanied by a staff co-witness, immediately escorted the candidate into the proctor area in full view of the surveillance camera.`,
    resolution: (w) =>
      `The TCA confiscated ${w.item}. Per client practice, the exam was terminated. The candidate was informed that the incident was being documented and escalated to ${w.escalated}.`,
  },
  {
    key: "power_failure",
    title: "Power failure",
    incident: "power",
    severity: "critical",
    candidate: false,
    fields: [t("at", "Power lost at"), n("impacted", "Candidates impacted"), t("restored", "Power restored at")],
    additional: (w) =>
      `At ${w.at}, a facility-wide power outage occurred, causing all workstations in the testing room to lose power unexpectedly while exams were in progress. A total of ${w.impacted} candidates were impacted.`,
    resolution: (w) =>
      `The TCA instructed all candidates to remain seated while facility maintenance and the Global Help Desk were notified. Power was restored at ${w.restored}. Workstations were restarted, and exams were re-launched from the TCA system. All candidates resumed testing from their last saved question with zero loss of test time or exam data.`,
  },
  {
    key: "reassignment",
    title: "Reassignment (workstation)",
    incident: "workstation",
    severity: "major",
    candidate: true,
    fields: [
      t("at", "Reported at"),
      x("issue", "What went wrong", "the workstation screen went blank during the exam"),
      t("moved", "Reassigned at"),
    ],
    additional: (w) =>
      `At ${w.at}, the candidate informed the TCA that ${w.issue}. To prevent any potential loss of exam time, the TCA immediately responded and assessed the situation.`,
    resolution: (w) =>
      `The TCA immediately powered down the affected workstation and reassigned the candidate to an alternate workstation at ${w.moved}. The examination was successfully relaunched, and the candidate resumed testing without any further interruptions or technical issues.`,
  },
  {
    key: "break_issue",
    title: "Break issue (unscheduled break)",
    incident: "candidate",
    severity: "minor",
    candidate: true,
    fields: [t("at", "Break requested at"), t("resumed", "Resumed at")],
    additional: (w) => `At ${w.at}, the candidate requested an unscheduled break during the examination.`,
    resolution: (w) =>
      `The TCA completed all required security and check-in procedures upon the candidate's return. The candidate resumed testing at ${w.resumed}.`,
  },
  {
    key: "dvr_check",
    title: "DVR check",
    incident: "other",
    severity: "minor",
    candidate: false,
    fields: [],
    additional: () => "During routine monitoring, the DVR was checked and found to be operating normally without any issues.",
    resolution: () =>
      "Verified DVR functionality and confirmed that recording and monitoring services are working as expected. No further action required.",
  },
];

export const CPR_FORMATS: CprFormat[] = FORMATS_RAW;

/** One entry, written out: the title and its two paragraphs. */
export function writeEntry(format: CprFormat, values: Values): { additional: string; resolution: string } {
  const w = words(format, values);
  return { additional: format.additional(w), resolution: format.resolution(w) };
}

/** The entry as it is pasted into a vendor's form. */
export function entryText(format: CprFormat, values: Values): string {
  const e = writeEntry(format, values);
  return `${format.title.toUpperCase()} :\n\nAdditional Information : ${e.additional}\n\nResolution : ${e.resolution}`;
}

/** Whole minutes from one instant to a later one, or null if either is missing or it was early. */
export function minutesLate(scheduledIso: string | null, arrivedIso: string | null): number | null {
  if (!scheduledIso || !arrivedIso) return null;
  const m = Math.round((Date.parse(arrivedIso) - Date.parse(scheduledIso)) / 60000);
  return Number.isFinite(m) && m > 0 ? m : null;
}
