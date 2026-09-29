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

export async function readFetsLiveDay(provider: Provider, date: string, centre: string): Promise<DaySchedule> {
  const url = process.env.FETS_LIVE_SUPABASE_URL?.replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = process.env.FETS_LIVE_SUPABASE_KEY;
  if (!url || !key) {
    return { connected: false, reason: "The fets.live calendar is not connected yet." };
  }
  // fets.live answers a public key with an empty list, not a refusal, so it
  // would read as a day with no exams.
  if (!isSecretKey(key)) {
    return { connected: false, reason: "The fets.live key is a public key; the calendar needs a secret key." };
  }
  const branch = branchOf(centre);
  if (!branch) return { connected: false, reason: `fets.live has no calendar for ${centre || "this centre"}.` };

  const q = new URLSearchParams({
    select: "client_name,exam_name,candidate_count,start_time,end_time",
    date: `eq.${date}`,
    branch_location: `eq.${branch}`,
  });
  // A new-style secret key goes in `apikey` alone; a legacy service-role JWT
  // also needs to be the bearer.
  const headers: Record<string, string> = { apikey: key };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  let rows: CalendarRow[];
  try {
    const res = await fetch(`${url}/rest/v1/calendar_sessions?${q}`, { headers, cache: "no-store" });
    if (!res.ok) return { connected: false, reason: `fets.live refused the calendar read (${res.status}).` };
    rows = (await res.json()) as CalendarRow[];
  } catch {
    return { connected: false, reason: "Could not reach fets.live." };
  }
  return summariseDay(rows, provider, date);
}
