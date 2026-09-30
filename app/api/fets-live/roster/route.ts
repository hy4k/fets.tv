import type { NextRequest } from "next/server";
import { LIVE_SOURCE, isProvider, readFetsLiveRoster } from "@/lib/fets-live";
import { todayInZone } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Brings today's roster for one provider in from fets.live.
 *
 * fets.live is read here, on the server, with the secret key; the rows are
 * then written through fets_sync_roster as the signed-in operator, so the
 * database's own centre and role checks still decide what is allowed. Safe to
 * call again: it adds new bookings and refreshes those not yet arrived.
 */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, center_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role === "viewer") return Response.json({ error: "Staff only" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { provider?: string; programme?: string | null };
  const provider = body.provider ?? null;
  if (!isProvider(provider)) return Response.json({ error: "Choose a provider" }, { status: 400 });

  const { data: centre } = await supabase
    .from("centers")
    .select("name, timezone")
    .eq("id", profile.center_id)
    .maybeSingle();
  const date = todayInZone(centre?.timezone ?? "Asia/Kolkata");

  const roster = await readFetsLiveRoster(provider, date, centre?.name ?? "");
  if (!roster.connected) return Response.json({ error: roster.reason }, { status: 502 });

  const { data, error } = await supabase.rpc("fets_sync_roster", {
    p_center: profile.center_id,
    p_exam_date: date,
    p_exam_name: roster.exam,
    p_source: `${LIVE_SOURCE}${provider}`,
    p_rows: roster.rows,
    p_programme: body.programme || null,
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ ...data, found: roster.rows.length, left_out: roster.skipped, provider, date });
}
