"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  Candidate,
  CandidateBreak,
  CandidateMaterial,
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
};

type Toast = { id: number; message: string; tone: "ok" | "error" };

type ConsoleValue = ConsoleSnapshot & {
  toasts: Toast[];
  notify: (message: string, tone?: Toast["tone"]) => void;
  refresh: () => Promise<void>;
  rpc: (fn: string, args: Record<string, unknown>, okMessage?: string) => Promise<boolean>;
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
      materials,
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
    ] = await Promise.all([
      candidatesQuery,
      supabase
        .from("incidents")
        .select("*")
        .eq("center_id", centerId)
        .order("started_at", { ascending: false })
        .limit(60),
      session
        ? supabase.from("candidate_materials").select("*").eq("exam_session_id", session.id)
        : null,
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
    ]);

    setSnapshot((prev) => ({
      ...prev,
      session: session ?? null,
      candidates: candidates?.data ?? (session ? prev.candidates : []),
      incidents: incidents.data ?? prev.incidents,
      materials: materials?.data ?? (session ? prev.materials : []),
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

  const value = useMemo<ConsoleValue>(
    () => ({
      ...snapshot,
      toasts,
      notify,
      refresh,
      rpc,
      // A TCA works whichever desk the duty roster puts them on, so they hold
      // every operational capability. Configuration stays with admins.
      isAdmin: snapshot.profile.role === "admin",
      canFrontOffice: ["admin", "tca", "front_office"].includes(snapshot.profile.role),
      canLab: ["admin", "tca", "lab_staff"].includes(snapshot.profile.role),
      canCall: ["admin", "tca"].includes(snapshot.profile.role),
    }),
    [snapshot, toasts, notify, refresh, rpc],
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}
