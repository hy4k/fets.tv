import { supabaseService } from "@/lib/supabase/service";
import { clockAt, todayInZone } from "@/lib/format";

/** One line on the front door: a time, an exam, and how many are sitting it. */
export type ScheduleSlot = {
  key: string;
  time: string;
  exam: string;
  part: string | null;
  seats: number;
  state: "upcoming" | "running" | "done";
};

export type CentreDay = {
  centre: string;
  timezone: string;
  slots: ScheduleSlot[];
};

/**
 * Today's exams, for a page anybody can open.
 *
 * The front door is read before anyone has signed in, and RLS rightly lets an
 * anonymous visitor see nothing, so this is read on the server with the
 * service key — the same way the hall TV is — and only a projection leaves:
 * the time, the exam, the part and a head count. No names, no roster numbers,
 * no phone numbers. Somebody looking over the desk's shoulder sees what the
 * day holds, not who is in it.
 *
 * Returns null when it cannot read, so the page can say so rather than claim
 * a quiet day.
 */
export async function todaysSchedule(now = new Date()): Promise<CentreDay[] | null> {
  try {
    const supabase = supabaseService();

    const { data: centres, error: centresError } = await supabase
      .from("centers")
      .select("id, name, timezone")
      .eq("active", true)
      .order("name");
    if (centresError || !centres) return null;

    const days: CentreDay[] = [];
    for (const centre of centres) {
      const { data: sessions, error: sessionsError } = await supabase
        .from("exam_sessions")
        .select("id, exam_name")
        .eq("center_id", centre.id)
        .eq("exam_date", todayInZone(centre.timezone, now));
      if (sessionsError) return null;
      if (!sessions?.length) continue;

      const { data: candidates, error: candidatesError } = await supabase
        .from("candidates")
        .select("exam_session_id, part, scheduled_at, exam_started_at, exam_finished_at, status")
        .in(
          "exam_session_id",
          sessions.map((s) => s.id),
        );
      if (candidatesError) return null;

      const examOf = new Map(sessions.map((s) => [s.id, s.exam_name]));
      const slots = new Map<string, ScheduleSlot & { at: number; started: number; finished: number }>();

      for (const c of candidates ?? []) {
        if (c.status === "no_show") continue;
        const exam = examOf.get(c.exam_session_id) ?? "Exam";
        const time = c.scheduled_at ? clockAt(c.scheduled_at, centre.timezone) : "—";
        const key = `${c.exam_session_id}|${time}|${c.part ?? ""}`;
        const slot = slots.get(key) ?? {
          key,
          time,
          exam,
          part: c.part,
          seats: 0,
          state: "upcoming" as const,
          at: c.scheduled_at ? new Date(c.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER,
          started: 0,
          finished: 0,
        };
        slot.seats += 1;
        if (c.exam_started_at) slot.started += 1;
        if (c.exam_finished_at || c.status === "completed" || c.status === "signed_out") slot.finished += 1;
        slots.set(key, slot);
      }

      days.push({
        centre: centre.name,
        timezone: centre.timezone,
        slots: [...slots.values()]
          .sort((a, b) => a.at - b.at || a.exam.localeCompare(b.exam))
          .map(({ key, time, exam, part, seats, started, finished }) => ({
            key,
            time,
            exam,
            part,
            seats,
            state: finished >= seats ? "done" : started > 0 ? "running" : "upcoming",
          })),
      });
    }
    return days;
  } catch {
    return null;
  }
}
