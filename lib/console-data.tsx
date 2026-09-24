"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { weekWindow } from "@/lib/coverage";
import { gapsAfterRefresh, type SnapshotTable } from "@/lib/snapshot-gaps";
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

export type { SnapshotTable } from "@/lib/snapshot-gaps";

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

  dutyBlocks: DutyBlock[];
  /** Walks of the floor, newest first. */
  walkthroughs: Walkthrough[];
  /** Who is not fully in, on which day. No row means in. */
  staffDays: StaffDay[];
  /**
   * The dates `staffDays` was actually fetched for.
   *
   * Carried rather than recomputed, because the screen's clock ticks every
   * second while this list was fetched once: recomputing the bounds from a
   * live `now` eventually claims a week the snapshot never loaded. Whether
   * the rows arrived at all is `unread`'s business, not this field's.
   */
  staffDaysWindow: { from: string; to: string };
  /**
   * The tables whose absence would be a lie, and which of them we do not have.
   *
   * A failed fetch and an empty table are the same shape — no rows — and for
   * most of what the console loads they are also near enough the same fact: an
   * empty list renders as a visibly empty screen and nobody is misled. But
   * wherever the *absence* of a row asserts something — no incident row means
   * nothing is wrong, no break row means nobody is on one, no staff_days row
   * means somebody is in — a fetch that quietly became `[]` states that thing,
   * falsely, in the calmest possible voice.
   *
   * `unread` lists the ones never read at all: what they hold is unknown, not
   * empty. `stale` lists the ones read once whose last re-read failed: there
   * are rows, they are from before, possibly from before an edit that has
   * already been written. The first is grounds to refuse to answer; the second
   * is grounds to stop calling the answer current.
   */
  unread: SnapshotTable[];
  stale: SnapshotTable[];
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
  /**
   * Whether any of these were never read. True means do not answer from them:
   * what they hold is unknown, and for these tables "no rows" is a claim.
   */
  isUnread: (...tables: SnapshotTable[]) => boolean;
  /** Whether any of these hold rows from before a failed re-read. */
  isStale: (...tables: SnapshotTable[]) => boolean;
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

    const { data: session, error: sessionError } = await supabase
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
        .limit(400),
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

    // Which loads failed this time round; gapsAfterRefresh decides what that
    // means for each of them.
    // A failed read of the exam day is indistinguishable from a day with no
    // exam on, and the loads that hang off it were skipped rather than
    // attempted — so they have no error of their own to report and the day
    // has to answer for them. Otherwise a blip mid-exam reads as "no roster".
    const failed: SnapshotTable[] = [
      ...(sessionError ? (["exam_sessions"] as const) : []),
      ...(candidates?.error || sessionError ? (["candidates"] as const) : []),
      ...(incidents.error || openIncidents.error ? (["incidents"] as const) : []),
      ...(materials?.error || sessionError ? (["candidate_materials"] as const) : []),
      ...(openBreaks.error ? (["candidate_breaks"] as const) : []),
      ...(staffDays.error ? (["staff_days"] as const) : []),
      ...(dutyPosts.error ? (["duty_posts"] as const) : []),
      ...(staff.error ? (["profiles"] as const) : []),
    ];

    // Whether there is an exam on, as far as this refresh knows. A failed read
    // is not an answer to that question, so it does not get to say no.
    const stillADay = sessionError || session !== null;

    setSnapshot((prev) => ({
      ...prev,
      // Keep the day we had rather than declaring there isn't one, and clear
      // what hangs off it only when there is genuinely no day — never because
      // the read of it failed. `stillADay` is that distinction: a real absence
      // empties the roster, an unread one leaves it exactly where it was.
      session: sessionError ? prev.session : (session ?? null),
      candidates: candidates?.data ?? (stillADay ? prev.candidates : []),
      incidents:
        incidents.data || openIncidents.data
          ? mergeById(openIncidents.data ?? [], incidents.data ?? [])
          : prev.incidents,
      materials: materials?.data ?? (stillADay ? prev.materials : []),
      programmeSections: programmeSections.data ?? prev.programmeSections,
      candidateSections:
        candidateSections?.data ?? (stillADay ? prev.candidateSections : []),
      dutyPosts: dutyPosts.data ?? prev.dutyPosts,
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
      ...gapsAfterRefresh(prev, failed),
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
    // back in deletes their staff_days row, and somebody leaving deletes their
    // profile; without these, the other consoles would go on showing an
    // absence that has been cancelled, or counting on a person who has gone.
    // The payload is ignored either way; all it does is prompt a refresh,
    // which reads back through the usual policies.
    for (const table of ["staff_days", "profiles"]) {
      channel.on("postgres_changes", { event: "DELETE", schema: "public", table }, scheduleRefresh);
    }

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

  const isUnread = useCallback(
    (...tables: SnapshotTable[]) => tables.some((t) => snapshot.unread.includes(t)),
    [snapshot.unread],
  );
  const isStale = useCallback(
    (...tables: SnapshotTable[]) => tables.some((t) => snapshot.stale.includes(t)),
    [snapshot.stale],
  );

  const value = useMemo<ConsoleValue>(
    () => ({
      ...snapshot,
      toasts,
      notify,
      refresh,
      rpc,
      rpcRead,
      isUnread,
      isStale,
      // Everybody who works here can run the place. Three people rotate
      // through every post in a day, and the one at the desk when a seat needs
      // adding is the one who should add it — so the only line left is between
      // staff and a viewer, which is what a retired login or an observer gets.
      // These four names are kept because the screens read well with them, and
      // because they are where a narrower rule would go if the centre grows.
      isAdmin: snapshot.profile.role !== "viewer",
      canFrontOffice: snapshot.profile.role !== "viewer",
      canLab: snapshot.profile.role !== "viewer",
      canCall: snapshot.profile.role !== "viewer",
    }),
    [snapshot, toasts, notify, refresh, rpc, rpcRead, isUnread, isStale],
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}
