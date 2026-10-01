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
  | "exams"
  | "roster"
  | "checkin"
  | "security"
  | "live"
  | "incidents"
  | "history"
  | "report"
  | "tv"
  | "home"
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

export type PlaceKey = "lobby" | "arrivals" | "hall" | "lab" | "screen" | "office";

/**
 * Which part of the building a place is in. The front desk team works the
 * Lobby and Arrivals; the Exam Hall is a room of its own; the rest sits to one
 * side, reached from the corner of the top bar.
 */
export type Wing = "front" | "hall" | "more";

export type Place = {
  key: PlaceKey;
  wing: Wing;
  title: string;
  /** One line under the title on the rail. */
  hint: string;
  /**
   * The place's colour, as two stops of a gradient. Each place has its own so
   * that a glance at the screen says where you are before any word is read:
   * the rail tile, the step bar, the primary buttons and the light behind the
   * page all take it.
   */
  tone: [string, string];
  steps: Step[];
};

export const PLACES: Place[] = [
  {
    // The day starts before anybody arrives: which exams are on, then the
    // roster that says who is coming.
    key: "lobby",
    wing: "front",
    title: "The Lobby",
    hint: "Exams today · roster",
    tone: ["oklch(0.86 0.1 80)", "oklch(0.7 0.12 62)"],
    steps: [
      { key: "exams", href: "/exams", label: "Exams today", sub: "From the fets.live calendar", n: 1 },
      { key: "roster", href: "/roster", label: "Roster", sub: "From fets.live", n: 2 },
    ],
  },
  {
    key: "arrivals",
    wing: "front",
    title: "The Check-in",
    hint: "Everyone · check-in · key",
    tone: ["oklch(0.82 0.12 190)", "oklch(0.68 0.13 215)"],
    // One page: the list is the check-in, and the key board opens after it.
    steps: [{ key: "checkin", href: "/front-office", label: "Check-in", sub: "Everyone booked today", n: 3 }],
  },
  {
    // The admin room, up to the moment a candidate has a seat: call, the
    // frisking gate, the seat. Once seated they belong to the Lab.
    key: "hall",
    wing: "hall",
    title: "The Admin",
    hint: "Call · frisking · seat",
    tone: ["oklch(0.8 0.11 275)", "oklch(0.64 0.15 272)"],
    steps: [{ key: "security", href: "/admin", label: "Admin", sub: "Call · security · seat", n: 4 }],
  },
  {
    // The testing room: who is sitting, how long they have left, and what went
    // wrong. The duty rota and 90-minute blocks live in fets.live now.
    key: "lab",
    wing: "hall",
    title: "The Lab",
    hint: "Live exams · incidents",
    tone: ["oklch(0.86 0.06 85)", "oklch(0.72 0.08 70)"],
    steps: [
      { key: "live", href: "/floor", label: "Live exams", sub: "Who is testing", n: 5 },
      { key: "incidents", href: "/incidents", label: "Incidents", sub: "What went wrong" },
    ],
  },
  {
    // The hall TV is used all day, so it is not filed under records any more.
    key: "screen",
    wing: "more",
    title: "The Hall TV",
    hint: "Screen · home · messages",
    tone: ["oklch(0.78 0.15 355)", "oklch(0.64 0.18 10)"],
    steps: [
      { key: "tv", href: "/tv", label: "TV screen", sub: "What the hall sees now" },
      { key: "home", href: "/tv/home", label: "Home screen", sub: "Welcome and layout" },
      { key: "messages", href: "/notices", label: "Messages", sub: "Put on the TV" },
    ],
  },
  {
    key: "office",
    wing: "more",
    title: "The Office",
    hint: "Past days · report · setup",
    tone: ["oklch(0.82 0.11 155)", "oklch(0.66 0.12 170)"],
    steps: [
      { key: "history", href: "/history", label: "Past days", sub: "Closed sessions" },
      { key: "report", href: "/report", label: "Problem report", sub: "For the vendor", staffOnly: true },
      { key: "setup", href: "/settings/center", label: "Setup", sub: "Centre, exams, staff" },
    ],
  },
];

/** CSS custom properties that paint the console in a place's colour. */
export function toneVars(place: Place | null): Record<string, string> {
  const [a, b] = place?.tone ?? ["oklch(0.85 0.15 80)", "oklch(0.72 0.15 58)"];
  return { "--place-accent": a, "--place-accent-2": b };
}

function matches(step: Step, pathname: string) {
  // "/tv" must not swallow some future "/tvx"; everything else owns its subtree.
  return pathname === step.href || pathname.startsWith(`${step.href}/`) ||
    (step.key === "setup" && pathname.startsWith("/settings"));
}

/** The place and step a path belongs to, or nulls for a path the rail does not know. */
export function locate(pathname: string): { place: Place | null; step: Step | null } {
  // The longest address wins, so /tv/home is the home screen, not /tv.
  let best: { place: Place | null; step: Step | null } = { place: null, step: null };
  for (const place of PLACES) {
    for (const step of place.steps) {
      if (matches(step, pathname) && (!best.step || step.href.length > best.step.href.length)) best = { place, step };
    }
  }
  return best;
}
