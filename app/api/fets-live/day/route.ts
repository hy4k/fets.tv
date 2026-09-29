import type { NextRequest } from "next/server";
import { isProvider, readFetsLiveDay } from "@/lib/fets-live";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** One provider's day from fets.live, for signed-in staff. */
export async function GET(request: NextRequest) {
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

  const provider = request.nextUrl.searchParams.get("provider");
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!isProvider(provider) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Choose a provider and a date" }, { status: 400 });
  }

  const { data: centre } = await supabase.from("centers").select("name").eq("id", profile.center_id).maybeSingle();
  return Response.json(await readFetsLiveDay(provider, date, centre?.name ?? ""));
}
