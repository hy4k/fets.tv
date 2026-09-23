"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { weekWindow } from "@/lib/coverage";
import type {
  Candidate,
  CandidateBreak,
  CandidateMaterial,
  CandidateSection,
  DutyBlock,
  DutyPost,
  Walkthrough,
  StaffDay,
  DisplayNotice,
  NoticeTemplate,
  CandidateEvent,
  Center,
  PublicDisplayCall,
  ExamProgramme,
  ExamSession,
  Incident,
  Lab,
  MaterialKind,
  ProgrammeSection,
  Profile,
  RosterColumnAlias,
  PublicDisplay,
  ScheduleRules,
  Workstation,
} from "@/lib/types";

export type ConsoleSnapshot = {
  center: Center;
  profile: Profile;
  rules: ScheduleRules;
  session: ExamSession | null;
  candidates: Candidate[];
  incidents: Incident[];
  /** Everything handed out today, one row per person per thing. */
  materials: CandidateMaterial[];
  materialKinds: MaterialKind[];
  /** The plan: which parts each exam has, and how long each should take. */
  programmeSections: ProgrammeSection[];
  /** What actually happened, for today's candidates. */
  candidateSections: CandidateSection[];
  /** The posts this centre staffs, and who is on them. */
  dutyPosts: DutyPost[];
  /**
   * True when the posts could not be read at all.
   *
   * An empty list and an unread one are the same shape and opposite facts: no
   * posts means the centre has not set any up, while an unread list means we
   * do not know how many people a day needs. The coverage screen has to tell
   * those apart before it says anything about a day.
   */
  dutyPostsUnread: boolean;
  dutyBlocks: DutyBlock[];
  /** Walks of the floor, newest first. */
  walkthroughs: Walkthrough[];
  /** Who is not fully in, on which day. No row means in. */
  staffDays: StaffDay[];
  /**
   * The dates `staffDays` was actually fetched for, or null if the fetch
   * failed.
   *
   * Carried rather than recomputed, because the screen's clock ticks every
   * second while this list was fetched once: recomputing the bounds from a
   * live `now` eventually claims a week the snapshot never loaded.
   *
   * Null rather than an empty list for the failure, because on this one
   * screen an absent row means somebody is *in*. A fetch that quietly became
   * `[]` would be read as a full week — the coverage screen announcing that
   * every day is covered is the precise lie it exists to prevent, and it must
   * not be able to tell it by failing.
   */
  staffDaysWindow: { from: string; to: string } | null;
  /**
   * True when the last attempt to re-read the rota failed.
   *
   * Distinct from a null window, which means there is nothing to show at all.
   * Here there *are* rows, they are simply the ones from before — possibly
   * from before an edit that has already been written. The screen keeps
   * drawing them, because a blank grid on a flaky connection helps nobody,
   * but it stops presenting them as current.
   */
  staffDaysStale: boolean;
  labs: Lab[];
  columnAliases: RosterColumnAlias[];
  workstations: Workstation[];
  events: CandidateEvent[];
  call: PublicDisplayCall | null;
  displays: PublicDisplay[];
  programmes: ExamProgramme[];
  openBreaks: CandidateBreak[];
  noticeTemplates: NoticeTemplate[];
  notice: DisplayNotice | null;
  operators: Record<string, string>;
  /**
   * When each person last set a signing PIN, or null if they have none.
   * Separate from `operators` because whether somebody can sign for a post is
   * a fact the console shows; the PIN itself never leaves the database.
   */
  pinSetAt: Record<string, string | null>;
};

type Toast = { id: number; message: string; tone: "ok" | "error" };

type ConsoleValue = ConsoleSnapshot & {
  toasts: Toast[];
  notify: (message: string, tone?: Toast["tone"]) => void;
  refresh: () => Promise<void>;
  rpc: (fn: string, args: Record<string, unknown>, okMessage?: string) => Promise<boolean>;
  /**
   * Like `rpc`, but hands back what the function returned.
   *
   * Some functions answer with a verdict instead of raising -- a wrong PIN has
   * to record the attempt, and an exception would roll that record back with
   * it -- so the caller needs the payload, not just whether the call landed.
   * Undefined means the call itself failed; the toast has already been shown.
   */
  rpcRead: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
  isAdmin: boolean;
  canFrontOffice: boolean;
  canLab: boolean;
  canCall: boolean;
};

const ConsoleContext = createContext<ConsoleValue | null>(null);

export function useConsole() {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("useConsole must be used inside ConsoleProvider");
  return value;
}

let toastSeq = 0;

/** Two overlapping fetches into one list, first occurrence winning. */
function mergeById<T extends { id: string }>(...lists: T[][]) {
  const seen = new Map<string, T>();
  for (const list of lists) for (const row of list) if (!seen.has(row.id)) seen.set(row.id, row);
  return [...seen.values()];
}

export function ConsoleProvider({
  initial,
  children,
}: {
  initial: ConsoleSnapshot;
  children: React.ReactNode;
}) {
  const supabase = supabaseBrowser();
  const [snapshot, setSnapshot] = useState(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const centerId = initial.center.id;

  const notify = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    const id = ++toastSeq;
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4500);
  }, []);

  const refresh = useCallback(async () => {
    // Worked out once, so the rows and the bounds recorded beside them are
    // the same pair even if this runs across midnight.
    const window = weekWindow();

    const { data: session } = await supabase
      .from("exam_sessions")
      .select("*")
      .eq("center_id", centerId)
      .in("status", ["ready", "live"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const candidatesQuery = session
      ? supabase
          .from("candidates")
          .select("*")
          .eq("exam_session_id", session.id)
          .order("scheduled_at", { ascending: true, nullsFirst: false })
          .order("public_token", { ascending: true })
      : null;

    const [
      candidates,
      incidents,
      openIncidents,
      materials,
      programmeSections,
      candidateSections,
      dutyPosts,
      walkthroughs,
      openDuty,
      servedDuty,
      labs,
      columnAliases,
      workstations,
      events,
      call,
      rules,
      center,
      displays,
      programmes,
      openBreaks,
      noticeTemplates,
      notice,
      staff,
      staffDays,
    ] = await Promise.all([
      candidatesQuery,
      supabase
        .from("incidents")
        .select("*")
        .eq("center_id", centerId)
        .order("started_at", { ascending: false })
        .limit(60),
      // Open ones without a limit; see the layout for why.
      supabase
        .from("incidents")
        .select("*")
        .eq("center_id", centerId)
        .is("resolved_at", null)
        .order("started_at", { ascending: false }),
      session
        ? supabase.from("candidate_materials").select("*").eq("exam_session_id", session.id)
        : null,
      supabase.from("programme_sections").select("*").order("programme_id").order("position"),
      session
        ? supabase
            .from("candidate_sections")
            .select("*")
            .eq("exam_session_id", session.id)
            .order("position")
        : null,
      supabase.from("duty_posts").select("*").eq("center_id", centerId).order("position"),
      supabase
        .from("walkthroughs")
        .select("*")
        .eq("center_id", centerId)
        .order("walked_at", { ascending: false })
        .limit(80),
      supabase.from("duty_blocks").select("*").eq("center_id", centerId).is("ended_at", null),
      supabase
        .from("duty_blocks")
        .select("*")
        .eq("center_id", centerId)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(60),
      supabase.from("labs").select("*").eq("center_id", centerId).order("position"),
      supabase.from("roster_column_aliases").select("*").eq("center_id", centerId).order("field"),
      supabase.from("workstations").select("*").eq("center_id", centerId).order("seat_code"),
      supabase
        .from("candidate_events")
        .select("*")
        .eq("center_id", centerId)
        .order("occurred_at", { ascending: false })
        .limit(40),
      supabase
        .from("public_display_calls")
        .select("*")
        .eq("center_id", centerId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("schedule_rules").select("*").eq("center_id", centerId).single(),
      supabase.from("centers").select("*").eq("id", centerId).single(),
      supabase.from("public_displays").select("*").eq("center_id", centerId).order("label"),
      supabase.from("exam_programmes").select("*").eq("center_id", centerId).eq("active", true).order("code"),
      supabase.from("candidate_breaks").select("*").eq("center_id", centerId).is("ended_at", null),
      supabase.from("notice_templates").select("*").eq("active", true).order("sort_order"),
      supabase
        .from("display_notices")
        .select("*")
        .eq("center_id", centerId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("profiles").select("id, display_name, pin_set_at").eq("center_id", centerId),
      // A window around today, not the whole history: the grid can page a few
      // weeks either way without another round trip, and a year of rota does
      // not ride along on every refresh.
      supabase
        .from("staff_days")
        .select("*")
        .eq("center_id", centerId)
        .gte("on_date", window.from)
        .lte("on_date", window.to),
    ]);

    setSnapshot((prev) => ({
      ...prev,
      session: session ?? null,
      candidates: candidates?.data ?? (session ? prev.candidates : []),
      incidents:
        incidents.data || openIncidents.data
          ? mergeById(openIncidents.data ?? [], incidents.data ?? [])
          : prev.incidents,
      materials: materials?.data ?? (session ? prev.materials : []),
      programmeSections: programmeSections.data ?? prev.programmeSections,
      candidateSections: candidateSections?.data ?? (session ? prev.candidateSections : []),
      dutyPosts: dutyPosts.data ?? prev.dutyPosts,
      dutyPostsUnread: Boolean(dutyPosts.error) && prev.dutyPostsUnread,
      walkthroughs: walkthroughs.data ?? prev.walkthroughs,
      dutyBlocks:
        openDuty.data || servedDuty.data
          ? [...(openDuty.data ?? []), ...(servedDuty.data ?? [])]
          : prev.dutyBlocks,
      labs: labs.data ?? prev.labs,
      columnAliases: columnAliases.data ?? prev.columnAliases,
      workstations: workstations.data ?? prev.workstations,
      events: events.data ?? prev.events,
      call: call.data ?? null,
      rules: rules.data ?? prev.rules,
      center: center.data ?? prev.center,
      displays: displays.data ?? prev.displays,
      programmes: programmes.data ?? prev.programmes,
      openBreaks: openBreaks.data ?? prev.openBreaks,
      noticeTemplates: noticeTemplates.data ?? prev.noticeTemplates,
      notice: notice.data ?? null,
      operators: staff.data
        ? Object.fromEntries(staff.data.map((o) => [o.id, o.display_name]))
        : prev.operators,
      pinSetAt: staff.data
        ? Object.fromEntries(staff.data.map((o) => [o.id, o.pin_set_at]))
        : prev.pinSetAt,
      staffDays: staffDays.data ?? prev.staffDays,
      staffDaysWindow: staffDays.error ? prev.staffDaysWindow : window,
      staffDaysStale: Boolean(staffDays.error),
    }));
  }, [centerId, supabase]);

  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => void refresh(), 120);
    };

    const channel = supabase.channel(`fets:center:${centerId}`);

    const watched: [table: string, filter: string][] = [
      ["candidates", `center_id=eq.${centerId}`],
      ["candidate_events", `center_id=eq.${centerId}`],
      ["incidents", `center_id=eq.${centerId}`],
      ["candidate_materials", `center_id=eq.${centerId}`],
      ["candidate_sections", `center_id=eq.${centerId}`],
      ["duty_blocks", `center_id=eq.${centerId}`],
      ["duty_posts", `center_id=eq.${centerId}`],
      ["walkthroughs", `center_id=eq.${centerId}`],
      ["profiles", `center_id=eq.${centerId}`],
      ["staff_days", `center_id=eq.${centerId}`],
      ["labs", `center_id=eq.${centerId}`],
      ["workstations", `center_id=eq.${centerId}`],
      ["public_display_calls", `center_id=eq.${centerId}`],
      ["schedule_rules", `center_id=eq.${centerId}`],
      ["centers", `id=eq.${centerId}`],
      ["candidate_breaks", `center_id=eq.${centerId}`],
      ["exam_programmes", `center_id=eq.${centerId}`],
      ["display_notices", `center_id=eq.${centerId}`],
    ];

    for (const [table, filter] of watched) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, scheduleRefresh);
    }

    // A deleted row arrives carrying only its primary key, so a center_id
    // filter can never match one and the event is dropped. Marking somebody
    // back in deletes their staff_days row, so without this the other consoles
    // would go on showing an absence that has been cancelled. The payload is
    // ignored either way; all it does is prompt a refresh, which reads back
    // through the usual policies.
    channel.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "staff_days" },
      scheduleRefresh,
    );

    channel.subscribe();

    return () => {
      if (pending.current) clearTimeout(pending.current);
      void supabase.removeChannel(channel);
    };
  }, [centerId, refresh, supabase]);

  const rpc = useCallback(
    async (fn: string, args: Record<string, unknown>, okMessage?: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)(fn, args);
      if (error) {
        notify(error.message, "error");
        return false;
      }
      if (okMessage) notify(okMessage);
      await refresh();
      return true;
    },
    [notify, refresh, supabase],
  );

  const rpcRead = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(fn, args);
      if (error) {
        notify(error.message, "error");
        return undefined;
      }
      await refresh();
      return data;
    },
    [notify, refresh, supabase],
  );

  const value = useMemo<ConsoleValue>(
    () => ({
      ...snapshot,
      toasts,
      notify,
      refresh,
      rpc,
      rpcRead,
      // A TCA works whichever desk the duty roster puts them on, so they hold
      // every operational capability. Configuration stays with admins.
      isAdmin: snapshot.profile.role === "admin",
      canFrontOffice: ["admin", "tca", "front_office"].includes(snapshot.profile.role),
      canLab: ["admin", "tca", "lab_staff"].includes(snapshot.profile.role),
      canCall: ["admin", "tca"].includes(snapshot.profile.role),
    }),
    [snapshot, toasts, notify, refresh, rpc, rpcRead],
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}
