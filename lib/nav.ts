/**
 * Where everything in the console lives.
 *
 * The rail used to list thirteen pages in one column. Staff do not think in
 * pages; they think in places — the desk where people arrive, the hall where
 * they sit the exam, the duty they are standing, and the paperwork. So the
 * rail names the four places, and the steps inside a place are tabs across
 * the top of the page, in the order a candidate goes through them.
 *
 * Addresses are unchanged, so bookmarks and the links between screens still
 * work; only how you get to them has moved.
 */
export type StepKey =
  | "roster"
  | "candidates"
  | "checkin"
  | "security"
  | "seating"
  | "live"
  | "duty"
  | "incidents"
  | "history"
  | "report"
  | "tv"
  | "messages"
  | "setup";

export type Step = {
  key: StepKey;
  href: string;
  /** What it is called now. */
  label: string;
  /** The old name or the room, so nobody is lost the first week. */
  sub: string;
  /** Numbered steps are the candidate's journey; the rest are not a sequence. */
  n?: number;
  /** Hidden from viewer accounts, whose screen would only say "not allowed". */
  staffOnly?: boolean;
};

export type PlaceKey = "arrivals" | "hall" | "duty" | "records";

export type Place = {
  key: PlaceKey;
  title: string;
  /** One line under the title on the rail. */
  hint: string;
  steps: Step[];
};

export const PLACES: Place[] = [
  {
    key: "arrivals",
    title: "Arrivals",
    hint: "Roster · list · check-in",
    steps: [
      { key: "roster", href: "/roster", label: "Roster", sub: "Upload the day", n: 1 },
      { key: "candidates", href: "/candidates", label: "Candidates", sub: "Everyone booked", n: 2 },
      { key: "checkin", href: "/front-office", label: "Check-in", sub: "Front office", n: 3 },
    ],
  },
  {
    key: "hall",
    title: "Exam hall",
    hint: "ID · seats · live",
    steps: [
      { key: "security", href: "/admin", label: "Security & ID", sub: "Admin room", n: 4 },
      { key: "seating", href: "/lab", label: "Seating", sub: "Lab", n: 5 },
      { key: "live", href: "/floor", label: "Live exams", sub: "Live floor", n: 6 },
    ],
  },
  {
    key: "duty",
    title: "Duty",
    hint: "Floor walk · incidents",
    steps: [
      { key: "duty", href: "/duty", label: "Floor walk & DVR", sub: "Who is on, the log" },
      { key: "incidents", href: "/incidents", label: "Incidents", sub: "What went wrong" },
    ],
  },
  {
    key: "records",
    title: "Records",
    hint: "Past days · TV · setup",
    steps: [
      { key: "history", href: "/history", label: "Past days", sub: "Closed sessions" },
      { key: "report", href: "/report", label: "Problem report", sub: "For the vendor", staffOnly: true },
      { key: "tv", href: "/tv", label: "TV screen", sub: "Hall display" },
      { key: "messages", href: "/notices", label: "Messages", sub: "On the TV" },
      { key: "setup", href: "/settings/center", label: "Setup", sub: "Centre, exams, staff" },
    ],
  },
];

function matches(step: Step, pathname: string) {
  // "/tv" must not swallow some future "/tvx"; everything else owns its subtree.
  return pathname === step.href || pathname.startsWith(`${step.href}/`) ||
    (step.key === "setup" && pathname.startsWith("/settings"));
}

/** The place and step a path belongs to, or nulls for a path the rail does not know. */
export function locate(pathname: string): { place: Place | null; step: Step | null } {
  for (const place of PLACES) {
    const step = place.steps.find((s) => matches(s, pathname));
    if (step) return { place, step };
  }
  return { place: null, step: null };
}
