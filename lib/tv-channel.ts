/**
 * The TV Channel: slides that take turns on the hall TV between calls.
 *
 * Each slide is one of a few ready-made designs that staff fill in with a few
 * words, so whatever goes up looks finished. Each has its own schedule — dates,
 * days of the week, hours of the day — and the TV checks it against its own
 * clock, so a slide comes on and goes off at the right minute without anybody
 * touching the console. A call always takes the screen first, and a message put
 * up by hand comes before the loop.
 *
 * Two kinds are not slides in the loop's usual sense. A video ad plays start to
 * finish across the whole screen, however long it runs, and a ticker line
 * scrolls along the bottom of the TV with the others while nobody is called.
 */

export type SlideKind = "promo" | "batch" | "partners" | "tip" | "poster" | "ad" | "ticker" | "today";

export type TvSlide = {
  id: string;
  center_id: string;
  kind: SlideKind;
  /** The staff's own name for it; never shown on the TV. */
  label: string;
  fields: Record<string, string>;
  /** Where the QR code takes a phone; null for no QR code. */
  link: string | null;
  /** Storage key while in the database; a signed URL by the time it reaches the TV. */
  media_path: string | null;
  media_url?: string | null;
  media_kind: "image" | "video" | null;
  seconds: number;
  /** YYYY-MM-DD, both inclusive; null for no limit. */
  starts_on: string | null;
  ends_on: string | null;
  /** 0 Sunday … 6 Saturday. */
  days: number[];
  /** HH:MM (or HH:MM:SS); both null for all day. */
  from_time: string | null;
  to_time: string | null;
  /** Shown at every centre, not only the one that made it. */
  everywhere: boolean;
  position: number;
  active: boolean;
  /** Short code for the counted QR link, /go/<code>; absent before the stats SQL. */
  code?: string | null;
};

export const BOOKING_LINK = "https://fets.in/testdrive/";

export const PARTNERS = ["Prometric", "Pearson VUE", "ETS", "PSI", "IELTS", "ACCA"];

/** A ticker line, short enough to read while it moves. */
export const TICKER_MAX = 140;

/**
 * The longest a video ad may hold the screen. Its own end decides; this only
 * stops a film uploaded by mistake from taking the TV for the afternoon.
 */
export const AD_MAX_SECONDS = 600;

export type FieldSpec = { key: string; label: string; max: number; placeholder: string; multiline?: boolean };

export type Design = {
  kind: SlideKind;
  name: string;
  hint: string;
  fields: FieldSpec[];
  /** What a new slide of this design starts with. */
  sample: Record<string, string>;
  /** Whether it can carry a QR code, and whether it starts with one. */
  qr: "none" | "optional" | "default";
  media?: boolean;
  seconds: number;
};

export const DESIGNS: Design[] = [
  {
    kind: "promo",
    name: "Mock exam promo",
    hint: "Exam, date, price and a QR code to book",
    fields: [
      { key: "eyebrow", label: "Small line on top", max: 30, placeholder: "Test drive" },
      { key: "title", label: "Exam", max: 40, placeholder: "CMA US Mock Exam" },
      { key: "when", label: "When", max: 50, placeholder: "Every Saturday · 10 AM" },
      { key: "price", label: "Price", max: 20, placeholder: "₹499" },
      { key: "cta", label: "Call to action", max: 40, placeholder: "Scan to book your seat" },
    ],
    sample: {
      eyebrow: "Test drive",
      title: "CMA US Mock Exam",
      when: "Every Saturday · 10 AM",
      price: "₹499",
      cta: "Scan to book your seat",
    },
    qr: "default",
    seconds: 15,
  },
  {
    kind: "batch",
    name: "Next batch / class",
    hint: "A course starting soon, with seats left",
    fields: [
      { key: "title", label: "Course", max: 40, placeholder: "IELTS Weekend Batch" },
      { key: "starts", label: "Starts", max: 30, placeholder: "Starts 4 November" },
      { key: "seats", label: "Seats left", max: 30, placeholder: "Only 6 seats left" },
      { key: "note", label: "One more line", max: 80, placeholder: "Saturdays and Sundays · 9 AM to 1 PM" },
    ],
    sample: {
      title: "IELTS Weekend Batch",
      starts: "Starts 4 November",
      seats: "Only 6 seats left",
      note: "Saturdays and Sundays · 9 AM to 1 PM",
    },
    qr: "optional",
    seconds: 12,
  },
  {
    kind: "partners",
    name: "Our partners",
    hint: "The testing organisations FETS delivers for",
    fields: [
      { key: "heading", label: "Heading", max: 50, placeholder: "Authorised test centre for" },
      { key: "names", label: "Names, one per line", max: 200, placeholder: PARTNERS.join("\n"), multiline: true },
    ],
    sample: { heading: "Authorised test centre for", names: PARTNERS.join("\n") },
    qr: "none",
    seconds: 10,
  },
  {
    kind: "tip",
    name: "Exam-day tip",
    hint: "One calm line for people about to sit",
    fields: [
      { key: "text", label: "The line", max: 120, placeholder: "Breathe. Read every question twice.", multiline: true },
      { key: "label", label: "Small label", max: 30, placeholder: "Exam-day tip" },
    ],
    sample: { text: "Breathe. Read every question twice.", label: "Exam-day tip" },
    qr: "none",
    seconds: 10,
  },
  {
    kind: "poster",
    name: "Full-screen poster",
    hint: "An image or short video made in Canva",
    fields: [{ key: "caption", label: "Caption under it", max: 80, placeholder: "Optional" }],
    sample: { caption: "" },
    qr: "optional",
    media: true,
    seconds: 12,
  },
  {
    kind: "ad",
    name: "Video ad",
    hint: "Plays start to finish, full screen. A call cuts in at once",
    fields: [],
    sample: {},
    qr: "optional",
    media: true,
    // Not used: an ad stays for as long as the video runs.
    seconds: 60,
  },
  {
    kind: "ticker",
    name: "Ticker line",
    hint: "A line that scrolls along the bottom of the TV",
    fields: [{ key: "text", label: "The line", max: TICKER_MAX, placeholder: "Mock exams every Saturday · book at fets.in/testdrive" }],
    sample: { text: "Mock exams every Saturday · book at fets.in/testdrive" },
    qr: "none",
    seconds: 12,
  },
  {
    kind: "today",
    name: "Today at FETS",
    hint: "The home screen: welcome, seats and exams running",
    fields: [],
    sample: {},
    qr: "none",
    seconds: 12,
  },
];

export const designOf = (kind: SlideKind) => DESIGNS.find((d) => d.kind === kind) ?? DESIGNS[0];

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MIN_SECONDS = 5;
export const MAX_SECONDS = 60;

/** A field as it shows on the TV: what staff typed, or the design's own wording. */
export function fieldOf(slide: Pick<TvSlide, "kind" | "fields">, key: string): string {
  const typed = slide.fields?.[key]?.trim();
  if (typed) return typed;
  // The poster's caption and a ticker line stay empty unless somebody writes one.
  if (slide.kind === "poster" || slide.kind === "ticker") return "";
  return designOf(slide.kind).sample[key] ?? "";
}

/**
 * What the QR code holds: this console's own /go/<code> link, which counts the
 * scan and sends the phone on to the slide's link — or the link itself when
 * the slide has no code yet or there is no address to count at.
 */
export function qrTarget(slide: Pick<TvSlide, "link" | "code">, base: string | null): string | null {
  if (!slide.link) return null;
  return slide.code && base ? `${base.replace(/\/+$/, "")}/go/${slide.code}` : slide.link;
}

/** "fets.in/testdrive" — short enough to read off the screen and type. */
export function shortLink(link: string): string {
  return link.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
}

/** Only web links go on the screen as a QR code. */
export function cleanLink(link: string | null | undefined): string | null {
  const t = link?.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The date, weekday and time of day at the centre. */
export function localNow(ms: number, timezone: string): { date: string; day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = DAY_NAMES.indexOf(get("weekday"));
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    day,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

const toMinutes = (t: string | null) => {
  const m = t?.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export type SlideStatus = "on" | "later" | "ended" | "off";

/** Whether a slide is playing now, later, never again, or switched off. */
export function slideStatus(slide: TvSlide, ms: number, timezone: string): SlideStatus {
  if (!slide.active) return "off";
  const now = localNow(ms, timezone);
  if (slide.ends_on && now.date > slide.ends_on) return "ended";
  if (slide.starts_on && now.date < slide.starts_on) return "later";
  const days = slide.days?.length ? slide.days : ALL_DAYS;
  if (!days.includes(now.day)) return "later";
  const from = toMinutes(slide.from_time);
  const to = toMinutes(slide.to_time);
  if (from !== null && to !== null && from !== to) {
    // A window past midnight (8 PM to 2 AM) wraps round.
    const inside = from < to ? now.minutes >= from && now.minutes < to : now.minutes >= from || now.minutes < to;
    if (!inside) return "later";
  } else if (from !== null && to === null && now.minutes < from) {
    return "later";
  } else if (to !== null && from === null && now.minutes >= to) {
    return "later";
  }
  return "on";
}

/** The home screen as a slide, for a loop that does not include it itself. */
export const TODAY_SLIDE: TvSlide = {
  id: "today",
  center_id: "",
  kind: "today",
  label: "Today at FETS",
  fields: {},
  link: null,
  media_path: null,
  media_kind: null,
  seconds: 12,
  starts_on: null,
  ends_on: null,
  days: ALL_DAYS,
  from_time: null,
  to_time: null,
  everywhere: false,
  position: -1,
  active: true,
};

/**
 * What the TV plays now, in order. Empty when nothing is scheduled, which
 * leaves the home screen exactly as it was. Otherwise the home screen keeps a
 * turn in the loop — it is where people read that they will be called by name
 * — unless the centre placed it themselves.
 */
export function playlist(slides: TvSlide[] | null | undefined, ms: number, timezone: string): TvSlide[] {
  if (!slides?.length || ms === 0) return [];
  const on = slides
    .filter((s) => s.kind !== "ticker" && slideStatus(s, ms, timezone) === "on")
    // A poster whose file is missing would be a blank screen; an ad without its video, a black one.
    .filter((s) => s.kind !== "poster" || !!s.media_url || !!s.fields?.caption?.trim())
    .filter((s) => s.kind !== "ad" || (!!s.media_url && s.media_kind === "video"))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  if (on.length === 0) return [];
  if (on.every((s) => s.kind === "today")) return [];
  return on.some((s) => s.kind === "today") ? on : [TODAY_SLIDE, ...on];
}

/** Whether an ad plays its sound; the TV still needs one tap after opening before it may. */
export const adSound = (slide: Pick<TvSlide, "fields">) => slide.fields?.sound === "on";

/** The ticker lines on now, in the console's order. Empty when there are none: no strip. */
export function tickerLines(slides: TvSlide[] | null | undefined, ms: number, timezone: string): string[] {
  if (!slides?.length || ms === 0) return [];
  return slides
    .filter((s) => s.kind === "ticker" && slideStatus(s, ms, timezone) === "on")
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((s) => fieldOf(s, "text").replace(/\s+/g, " ").slice(0, TICKER_MAX))
    .filter(Boolean);
}

/**
 * The ticker's text for one pass, repeated until it is long enough to fill the
 * strip, and how long that pass takes: about five characters a second, a pace
 * that reads from the back of the hall.
 */
export function tickerRun(lines: string[]): { lines: string[]; seconds: number } {
  const chars = lines.reduce((n, l) => n + l.length + 6, 0);
  if (chars === 0) return { lines: [], seconds: 0 };
  const repeat = Math.max(1, Math.ceil(90 / chars));
  const run = Array.from({ length: repeat }, () => lines).flat();
  return { lines: run, seconds: Math.max(12, Math.round((chars * repeat) / 5)) };
}

/** How long a slide stays, in a word for the console's list. */
export function lengthText(slide: Pick<TvSlide, "kind" | "seconds">): string {
  if (slide.kind === "ad") return "plays to the end";
  if (slide.kind === "ticker") return "scrolls along the bottom";
  return `${slide.seconds}s`;
}

/** "Daily · all day", "Mon–Fri · 9 AM–1 PM · until 31 Oct" — the schedule in a line. */
export function scheduleLine(slide: TvSlide): string {
  const days = slide.days?.length ? [...slide.days].sort() : ALL_DAYS;
  const dayText =
    days.length === 7
      ? "Daily"
      : days.join() === "1,2,3,4,5"
        ? "Mon–Fri"
        : days.join() === "0,6"
          ? "Weekends"
          : days.map((d) => DAY_NAMES[d]).join(", ");
  const time = (t: string | null) => {
    const m = toMinutes(t);
    if (m === null) return null;
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${((h + 11) % 12) + 1}${min ? `:${String(min).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
  };
  const from = time(slide.from_time);
  const to = time(slide.to_time);
  const hours = from && to ? `${from}–${to}` : from ? `from ${from}` : to ? `until ${to}` : "all day";
  const date = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const range =
    slide.starts_on && slide.ends_on
      ? `${date(slide.starts_on)} – ${date(slide.ends_on)}`
      : slide.starts_on
        ? `from ${date(slide.starts_on)}`
        : slide.ends_on
          ? `until ${date(slide.ends_on)}`
          : null;
  return [dayText, hours, range].filter(Boolean).join(" · ");
}

const clockText = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * For a slide that is scheduled but not on: when it next comes on, so nobody
 * wonders why the TV is not showing what they just saved.
 */
export function nextOn(slide: TvSlide, ms: number, timezone: string): string | null {
  if (ms === 0 || slideStatus(slide, ms, timezone) !== "later") return null;
  const days = slide.days?.length ? slide.days : ALL_DAYS;
  const from = toMinutes(slide.from_time) ?? 0;
  // An all-day slide just comes on that day.
  const at = slide.from_time ? ` at ${clockText(from)}` : "";
  // A fortnight ahead, a day at a time.
  for (let d = 0; d < 15; d++) {
    const probe = localNow(ms + d * 86400000, timezone);
    if (slide.ends_on && probe.date > slide.ends_on) return null;
    if (slide.starts_on && probe.date < slide.starts_on) continue;
    if (!days.includes(probe.day)) continue;
    if (d === 0) {
      const now = localNow(ms, timezone);
      if (now.minutes < from) return `Comes on today${at}`;
      continue;
    }
    if (d === 1) return `Comes on tomorrow${at}`;
    const date = new Date(`${probe.date}T00:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return `Comes on ${date}${at}`;
  }
  return null;
}
