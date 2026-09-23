import { redirect } from "next/navigation";
import { DataGaps } from "@/components/console/DataGaps";
import { Header } from "@/components/console/Header";
import { NavRail } from "@/components/console/NavRail";
import { Toasts } from "@/components/console/Toasts";
import { ConsoleProvider, type ConsoleSnapshot } from "@/lib/console-data";
import { weekWindow } from "@/lib/coverage";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Two overlapping fetches into one list, first occurrence winning.
 *
 * The open rows and the recent history are asked for separately so neither
 * limit can hide the other, and they overlap in the middle.
 */
function mergeById<T extends { id: string }>(...lists: T[][]) {
  const seen = new Map<string, T>();
  for (const list of lists) for (const row of list) if (!seen.has(row.id)) seen.set(row.id, row);
  return [...seen.values()];
}

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login?error=no-profile");

  const [{ data: center }, { data: rules }, { data: session, error: sessionError }] =
    await Promise.all([
      supabase.from("centers").select("*").eq("id", profile.center_id).single(),
      supabase.from("schedule_rules").select("*").eq("center_id", profile.center_id).maybeSingle(),
      supabase
        .from("exam_sessions")
        .select("*")
        .eq("center_id", profile.center_id)
        .in("status", ["ready", "live"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (!center || !rules) {
    return (
      <div className="flex h-screen items-center justify-center shell-bg p-6 text-center">
        <p className="max-w-md text-[14px] text-fg-muted">
          This center has no schedule rules yet. Run <code className="font-mono text-gold">supabase/seed.sql</code>{" "}
          (or insert a <code className="font-mono text-gold">schedule_rules</code> row) before opening the console.
        </p>
      </div>
    );
  }

  // Once, so the rows and the bounds recorded beside them are the same pair.
  const rotaWindow = weekWindow();

  const [
    candidates,
    incidents,
    openIncidents,
    materials,
    materialKinds,
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
    displays,
    operators,
    programmes,
    openBreaks,
    noticeTemplates,
    notice,
    staffDays,
  ] = await Promise.all([
    session
      ? supabase
          .from("candidates")
          .select("*")
          .eq("exam_session_id", session.id)
          .order("scheduled_at", { ascending: true, nullsFirst: false })
          .order("public_token", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("incidents")
      .select("*")
      .eq("center_id", center.id)
      .order("started_at", { ascending: false })
      .limit(60),
    // Everything still open, without a limit, the same way the duty blocks are
    // fetched. A slice of the sixty newest is history; an unresolved incident
    // that falls off the end of it stops appearing in a handover, which is the
    // one place it must not.
    supabase
      .from("incidents")
      .select("*")
      .eq("center_id", center.id)
      .is("resolved_at", null)
      .order("started_at", { ascending: false }),
    session
      ? supabase.from("candidate_materials").select("*").eq("exam_session_id", session.id)
      : Promise.resolve({ data: [], error: null }),
    // Every kind, not only the active ones: something retired mid-day may
    // still be in somebody's hands, and it has to stay collectable.
    supabase.from("material_kinds").select("*").order("sort_order"),
    supabase
      .from("programme_sections")
      .select("*")
      .order("programme_id")
      .order("position"),
    session
      ? supabase
          .from("candidate_sections")
          .select("*")
          .eq("exam_session_id", session.id)
          .order("position")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("duty_posts").select("*").eq("center_id", center.id).order("position"),
    supabase
      .from("walkthroughs")
      .select("*")
      .eq("center_id", center.id)
      .order("walked_at", { ascending: false })
      .limit(80),
    // Everything still open, plus a bounded slice of what has been served, which
    // is what a handover needs. The open ones are fetched without a limit: a
    // busy week of history must never push a live duty out of the answer.
    supabase.from("duty_blocks").select("*").eq("center_id", center.id).is("ended_at", null),
    supabase
      .from("duty_blocks")
      .select("*")
      .eq("center_id", center.id)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(60),
    supabase.from("labs").select("*").eq("center_id", center.id).order("position"),
    supabase.from("roster_column_aliases").select("*").eq("center_id", center.id).order("field"),
    supabase.from("workstations").select("*").eq("center_id", center.id).order("seat_code"),
    supabase
      .from("candidate_events")
      .select("*")
      .eq("center_id", center.id)
      .order("occurred_at", { ascending: false })
      .limit(40),
    supabase
      .from("public_display_calls")
      .select("*")
      .eq("center_id", center.id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("public_displays").select("*").eq("center_id", center.id).order("label"),
    supabase.from("profiles").select("id, display_name, pin_set_at").eq("center_id", center.id),
    supabase.from("exam_programmes").select("*").eq("center_id", center.id).eq("active", true).order("code"),
    supabase.from("candidate_breaks").select("*").eq("center_id", center.id).is("ended_at", null),
    supabase.from("notice_templates").select("*").eq("active", true).order("sort_order"),
    supabase
      .from("display_notices")
      .select("*")
      .eq("center_id", center.id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // A window around today rather than the whole rota, so the grid can page a
    // couple of months either way without another round trip and a year of
    // history never rides along on a refresh.
    supabase
      .from("staff_days")
      .select("*")
      .eq("center_id", center.id)
      .gte("on_date", rotaWindow.from)
      .lte("on_date", rotaWindow.to),
  ]);

  const snapshot: ConsoleSnapshot = {
    center,
    profile,
    rules,
    session: session ?? null,
    candidates: candidates.data ?? [],
    incidents: mergeById(openIncidents.data ?? [], incidents.data ?? []),
    materials: materials.data ?? [],
    materialKinds: materialKinds.data ?? [],
    programmeSections: programmeSections.data ?? [],
    candidateSections: candidateSections.data ?? [],
    dutyPosts: dutyPosts.data ?? [],
    walkthroughs: walkthroughs.data ?? [],
    dutyBlocks: [...(openDuty.data ?? []), ...(servedDuty.data ?? [])],
    labs: labs.data ?? [],
    columnAliases: columnAliases.data ?? [],
    workstations: workstations.data ?? [],
    events: events.data ?? [],
    call: call.data ?? null,
    displays: displays.data ?? [],
    programmes: programmes.data ?? [],
    openBreaks: openBreaks.data ?? [],
    noticeTemplates: noticeTemplates.data ?? [],
    notice: notice.data ?? null,
    operators: Object.fromEntries((operators.data ?? []).map((o) => [o.id, o.display_name])),
    pinSetAt: Object.fromEntries((operators.data ?? []).map((o) => [o.id, o.pin_set_at])),
    staffDays: staffDays.data ?? [],
    staffDaysWindow: rotaWindow,
    // What never arrived. Nothing has been read twice yet, so nothing can be
    // stale; a first load either has the rows or does not.
    unread: [
      // A failed read of the exam day looks exactly like a day with no exam
      // on, and the loads that hang off it were skipped rather than attempted,
      // so they have no error of their own and the day answers for them.
      ...(sessionError ? (["exam_sessions"] as const) : []),
      ...(candidates.error || sessionError ? (["candidates"] as const) : []),
      ...(incidents.error || openIncidents.error ? (["incidents"] as const) : []),
      ...(materials.error || sessionError ? (["candidate_materials"] as const) : []),
      ...(openBreaks.error ? (["candidate_breaks"] as const) : []),
      ...(staffDays.error ? (["staff_days"] as const) : []),
      ...(dutyPosts.error ? (["duty_posts"] as const) : []),
      ...(operators.error ? (["profiles"] as const) : []),
    ],
    stale: [],
  };

  return (
    <ConsoleProvider initial={snapshot}>
      {/* Phone and tablet get the nav as a bar under the content; from md up it
          is the side rail. h-dvh, not h-screen, so a phone's address bar does
          not push the nav off the bottom. */}
      <div className="flex h-dvh flex-col gap-[10px] overflow-hidden shell-bg p-[10px] md:flex-row md:gap-[14px] md:p-[14px]">
        <NavRail />
        <main className="order-first flex min-h-0 min-w-0 flex-1 flex-col gap-[10px] md:order-none md:gap-[14px]">
          <Header />
          <DataGaps />
          {children}
        </main>
        <Toasts />
      </div>
    </ConsoleProvider>
  );
}
