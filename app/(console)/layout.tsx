import { redirect } from "next/navigation";
import { Header } from "@/components/console/Header";
import { NavRail } from "@/components/console/NavRail";
import { Toasts } from "@/components/console/Toasts";
import { ConsoleProvider, type ConsoleSnapshot } from "@/lib/console-data";
import { supabaseServer } from "@/lib/supabase/server";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login?error=no-profile");

  const [{ data: center }, { data: rules }, { data: session }] = await Promise.all([
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

  const [candidates, workstations, events, call, displays, operators, programmes, openBreaks] =
    await Promise.all([
    session
      ? supabase
          .from("candidates")
          .select("*")
          .eq("exam_session_id", session.id)
          .order("scheduled_at", { ascending: true, nullsFirst: false })
          .order("public_token", { ascending: true })
      : Promise.resolve({ data: [] }),
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
    supabase.from("profiles").select("id, display_name").eq("center_id", center.id),
    supabase.from("exam_programmes").select("*").eq("center_id", center.id).eq("active", true).order("code"),
    supabase.from("candidate_breaks").select("*").eq("center_id", center.id).is("ended_at", null),
  ]);

  const snapshot: ConsoleSnapshot = {
    center,
    profile,
    rules,
    session: session ?? null,
    candidates: candidates.data ?? [],
    workstations: workstations.data ?? [],
    events: events.data ?? [],
    call: call.data ?? null,
    displays: displays.data ?? [],
    programmes: programmes.data ?? [],
    openBreaks: openBreaks.data ?? [],
    operators: Object.fromEntries((operators.data ?? []).map((o) => [o.id, o.display_name])),
  };

  return (
    <ConsoleProvider initial={snapshot}>
      <div className="flex h-screen gap-[14px] overflow-hidden shell-bg p-[14px]">
        <NavRail />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-[14px]">
          <Header />
          {children}
        </main>
        <Toasts />
      </div>
    </ConsoleProvider>
  );
}
