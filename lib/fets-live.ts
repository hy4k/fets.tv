/**
 * The day's schedule from the fets.live calendar.
 *
 * fets.live is a separate Supabase project. Its address and a read-only key
 * are server settings (FETS_LIVE_SUPABASE_URL, FETS_LIVE_SUPABASE_KEY), never
 * shipped to the browser. Until they are set, or until the calendar's table is
 * known, this answers "not connected" — the page says so rather than showing
 * an empty day that looks like no exams.
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

export function isProvider(v: string | null): v is Provider {
  return !!v && (PROVIDERS as readonly string[]).includes(v);
}

export async function readFetsLiveDay(provider: Provider, date: string, centre: string): Promise<DaySchedule> {
  const url = process.env.FETS_LIVE_SUPABASE_URL;
  const key = process.env.FETS_LIVE_SUPABASE_KEY;
  if (!url || !key) {
    return { connected: false, reason: "The fets.live calendar is not connected yet." };
  }
  // The calendar's table and columns are wired in once fets.live's schema is
  // known; guessing them would show wrong numbers with confidence.
  void provider;
  void date;
  void centre;
  return { connected: false, reason: "fets.live is reachable, but its calendar table is not mapped yet." };
}
