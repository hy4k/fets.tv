/**
 * The day's schedule from the fets.live calendar.
 *
 * fets.live is a separate Supabase project. Its calendar is the
 * `calendar_sessions` table: one row per exam slot, with the date, a start
 * and end time in IST ("09:00"), the provider (`client_name`, stored in
 * capitals), the exam, how many are booked, and the branch ("calicut" or
 * "cochin").
 *
 * fets.live only lets signed-in users read that table, so the key here is a
 * secret key kept in the server settings (FETS_LIVE_SUPABASE_URL,
 * FETS_LIVE_SUPABASE_KEY) and never shipped to the browser. Until they are
 * set this answers "not connected" — the page says so rather than showing an
 * empty day that looks like no exams.
 */
export const PROVIDERS = ["Prometric", "Pearson VUE", "CELPIP", "PSI", "ITTS"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Where the browser remembers the provider chosen on Exams today. */
export const REMEMBER_PROVIDER = "fets.provider";

/** How a day brought in from fets.live is labelled, and read back for re-syncs. */
export const LIVE_SOURCE = "fets.live · ";
export function liveProviderOf(source: string | null | undefined): Provider | null {
  if (!source?.startsWith(LIVE_SOURCE)) return null;
  const p = source.slice(LIVE_SOURCE.length);
  return isProvider(p) ? p : null;
}

export type DaySchedule =
  | { connected: false; reason: string }
  | {
      connected: true;
      provider: Provider;
      date: string;
      /** Number of candidates booked. */
      count: number;
      /** Each exam on the day with its bookings. */
      exams: { name: string; count: number; start: string | null; end: string | null }[];
      /** First start to last finish, in hours. */
      hours: number | null;
    };

/** One row of fets.live's `calendar_sessions`, the columns read here. */
export type CalendarRow = {
  client_name: string | null;
  exam_name: string | null;
  candidate_count: number | null;
  start_time: string | null;
  end_time: string | null;
};

/** The whole day at one branch, every provider together. */
export type DayTotals =
  | { connected: false; reason: string }
  | {
      connected: true;
      date: string;
      count: number;
      /** How many of the five providers have anybody booked. */
      providers: number;
      first: string | null;
      last: string | null;
    };

export function isProvider(v: string | null): v is Provider {
  return !!v && (PROVIDERS as readonly string[]).includes(v);
}

/**
 * Which provider a calendar row belongs to.
 *
 * `client_name` is the provider as fets.live stores it (PROMETRIC, PEARSON
 * VUE, CELPIP, PSI, ITTS). Older rows sometimes carry the exam there instead,
 * so the exam name is the fallback, using fets.live's own rules: CELPIP is
 * its own provider, CMA US runs through Prometric. Anything else that is
 * named — IELTS, say — is none of the five and is left out, as are FETS's
 * own mock exams ("MOCK EXAM - CMA US"), which no provider delivers.
 */
export function providerOf(client: string | null, exam: string | null): Provider | null {
  const c = (client ?? "").toUpperCase();
  const e = (exam ?? "").toUpperCase();
  if (/\bMOCK\b/.test(c) || /\bMOCK\b/.test(e)) return null;
  if (c.includes("CELPIP") || e.includes("CELPIP")) return "CELPIP";
  if (c.includes("PROMETRIC")) return "Prometric";
  if (c.includes("PEARSON") || /\bVUE\b/.test(c)) return "Pearson VUE";
  if (/\bPSI\b/.test(c)) return "PSI";
  if (/\bITTS\b/.test(c)) return "ITTS";
  if (/\bCMA\b/.test(e) || /\bCMA\b/.test(c)) return "Prometric";
  if (/\bPSI\b/.test(e)) return "PSI";
  if (/\bITTS\b/.test(e)) return "ITTS";
  return null;
}

/** fets.live's branch for a fets.tv centre, from the centre's name. */
export function branchOf(centre: string): "calicut" | "cochin" | null {
  const n = centre.toLowerCase();
  if (n.includes("cochin") || n.includes("kochi")) return "cochin";
  if (n.includes("calicut") || n.includes("kozhikode")) return "calicut";
  return null;
}

// fets.live keeps times as IST wall-clock ("09:00"); both centres are in IST.
function atIst(date: string, time: string | null): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!m) return null;
  return `${date}T${m[1].padStart(2, "0")}:${m[2]}:00+05:30`;
}

/** One provider's day, from that day's calendar rows at one branch. */
export function summariseDay(rows: CalendarRow[], provider: Provider, date: string): DaySchedule {
  const exams = new Map<string, { name: string; count: number; start: string | null; end: string | null }>();
  let count = 0;
  for (const r of rows) {
    if (providerOf(r.client_name, r.exam_name) !== provider) continue;
    const n = Math.max(0, Number(r.candidate_count) || 0);
    // The calendar is typed by hand: "Microsoft", "MICROSOFT " and
    // "microsoft" are one exam, shown as first spelled.
    const name = (r.exam_name ?? "").trim().replace(/\s+/g, " ") || provider;
    const key = name.toUpperCase();
    const start = atIst(date, r.start_time);
    // A slot saved without an end finishes when it starts, as fets.live saves it.
    const end = atIst(date, r.end_time) ?? start;
    const e = exams.get(key) ?? { name, count: 0, start: null, end: null };
    e.count += n;
    if (start && (!e.start || start < e.start)) e.start = start;
    if (end && (!e.end || end > e.end)) e.end = end;
    exams.set(key, e);
    count += n;
  }
  const list = [...exams.values()].sort((a, b) => (a.start ?? "~").localeCompare(b.start ?? "~"));
  const starts = list.map((e) => e.start).filter((s): s is string => !!s);
  const ends = list.map((e) => e.end).filter((s): s is string => !!s);
  const first = starts.length ? Date.parse(starts.sort()[0]) : null;
  const last = ends.length ? Date.parse(ends.sort().at(-1)!) : null;
  const hours = first !== null && last !== null && last >= first ? (last - first) / 3600000 : null;
  return { connected: true, provider, date, count, exams: list, hours };
}

/**
 * Whether a Supabase key can read past signed-in-only rules: a new-style
 * secret key, or a legacy JWT whose role is service_role (a legacy anon JWT
 * is as public as a publishable key).
 */
export function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  if (!key.startsWith("eyJ")) return false;
  try {
    const payload = key.split(".")[1] ?? "";
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))?.role === "service_role";
  } catch {
    return false;
  }
}

/** Every provider's day together, for the Lobby's "today at the centre". */
export function summariseAll(rows: CalendarRow[], date: string): DayTotals {
  let count = 0;
  const providers = new Set<Provider>();
  let first: string | null = null;
  let last: string | null = null;
  for (const p of PROVIDERS) {
    const day = summariseDay(rows, p, date);
    if (!day.connected || day.count === 0) continue;
    providers.add(p);
    count += day.count;
    for (const e of day.exams) {
      if (e.start && (!first || e.start < first)) first = e.start;
      if (e.end && (!last || e.end > last)) last = e.end;
    }
  }
  return { connected: true, date, count, providers: providers.size, first, last };
}

export async function readFetsLiveDay(provider: Provider, date: string, centre: string): Promise<DaySchedule> {
  const got = await readCalendarRows(date, centre);
  return "reason" in got ? { connected: false, reason: got.reason } : summariseDay(got.rows, provider, date);
}

export async function readFetsLiveTotals(date: string, centre: string): Promise<DayTotals> {
  const got = await readCalendarRows(date, centre);
  return "reason" in got ? { connected: false, reason: got.reason } : summariseAll(got.rows, date);
}

async function readCalendarRows(date: string, centre: string): Promise<{ rows: CalendarRow[] } | { reason: string }> {
  return readTable<CalendarRow>("calendar_sessions", centre, {
    select: "client_name,exam_name,candidate_count,start_time,end_time",
    date: `eq.${date}`,
  });
}

/** One of fets.live's `candidates`, the columns read here. */
export type LiveCandidate = {
  full_name: string | null;
  phone: string | null;
  roster_number: string | null;
  exam_part: string | null;
  exam_start_time: string | null;
  client_name: string | null;
  exam_name: string | null;
  status: string | null;
};

/** A row as fets_sync_roster takes it. */
export type SyncRow = {
  roster_number: string;
  first_name: string;
  last_name: string;
  part: string | null;
  phone: string | null;
  scheduled_at: string | null;
};

export type LiveRoster =
  | { connected: false; reason: string }
  | { connected: true; provider: Provider; date: string; exam: string; rows: SyncRow[]; skipped: number };

/**
 * fets.live keeps one name field; the desk matches ID against first and last.
 * The last word is the surname, as on the provider rosters.
 */
export function splitName(full: string | null): { first_name: string; last_name: string } {
  const words = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { first_name: words[0] ?? "", last_name: "" };
  return { first_name: words.slice(0, -1).join(" "), last_name: words.at(-1)! };
}

/**
 * One provider's candidates for the day, shaped for the sync. Rows with no
 * roster number cannot be matched on the next sync, so they are left out and
 * counted, as are cancelled bookings. The part is the exam part when fets.live
 * has one, else the exam, so a day with two exams still reads apart.
 */
export function rosterFrom(rows: LiveCandidate[], provider: Provider, date: string): Extract<LiveRoster, { connected: true }> {
  const out: SyncRow[] = [];
  const exams = new Map<string, string>();
  let skipped = 0;
  for (const r of rows) {
    if (providerOf(r.client_name, r.exam_name) !== provider) continue;
    const roster = (r.roster_number ?? "").trim();
    const name = splitName(r.full_name);
    if (!roster || /cancel/i.test(r.status ?? "") || (!name.first_name && !name.last_name)) {
      skipped++;
      continue;
    }
    const exam = (r.exam_name ?? "").trim().replace(/\s+/g, " ");
    if (exam) exams.set(exam.toUpperCase(), exams.get(exam.toUpperCase()) ?? exam);
    out.push({
      roster_number: roster,
      ...name,
      part: (r.exam_part ?? "").trim() || exam || null,
      phone: (r.phone ?? "").trim() || null,
      scheduled_at: atIst(date, r.exam_start_time),
    });
  }
  const names = [...exams.values()];
  return { connected: true, provider, date, exam: names.length === 1 ? names[0] : provider, rows: out, skipped };
}

export async function readFetsLiveRoster(provider: Provider, date: string, centre: string): Promise<LiveRoster> {
  // exam_date is a timestamp at IST midnight, so the day is a range.
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const got = await readTable<LiveCandidate>("candidates", centre, {
    select: "full_name,phone,roster_number,exam_part,exam_start_time,client_name,exam_name,status",
    and: `(exam_date.gte.${date}T00:00:00+05:30,exam_date.lt.${next}T00:00:00+05:30)`,
    order: "exam_start_time.asc.nullslast,full_name.asc",
  });
  return "reason" in got ? { connected: false, reason: got.reason } : rosterFrom(got.rows, provider, date);
}

export async function readTable<T>(
  table: string,
  centre: string,
  query: Record<string, string>,
): Promise<{ rows: T[] } | { reason: string }> {
  const url = process.env.FETS_LIVE_SUPABASE_URL?.replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = process.env.FETS_LIVE_SUPABASE_KEY;
  if (!url || !key) {
    return { reason: "fets.live is not connected yet." };
  }
  // fets.live answers a public key with an empty list, not a refusal, so it
  // would read as a day with nobody booked.
  if (!isSecretKey(key)) {
    return { reason: "The fets.live key is a public key; fets.live needs a secret key." };
  }
  const branch = branchOf(centre);
  if (!branch) return { reason: `fets.live has nothing for ${centre || "this centre"}.` };

  const q = new URLSearchParams({ ...query, branch_location: `eq.${branch}` });
  // A new-style secret key goes in `apikey` alone; a legacy service-role JWT
  // also needs to be the bearer.
  const headers: Record<string, string> = { apikey: key };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  try {
    const rows: T[] = [];
    for (let offset = 0; offset <= 5000; offset += 1000) {
      q.set("limit", "1000");
      q.set("offset", String(offset));
      const res = await fetch(`${url}/rest/v1/${table}?${q}`, { headers, cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!res.ok) return { reason: `fets.live refused the read (${res.status}).` };
      const page = await res.json() as T[];
      rows.push(...page);
      if (rows.length > 5000) return { reason: "More than 5000 rows; review the source before syncing." };
      if (page.length < 1000) return { rows };
    }
    return { reason: "Roster pagination did not complete." };
  } catch {
    return { reason: "Could not reach fets.live." };
  }
}
