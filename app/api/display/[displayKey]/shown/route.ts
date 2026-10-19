import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * A TV reports how many times each TV Channel slide came on since it last
 * reported. The display key says which centre it is; the database counts only
 * slides that centre plays.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ displayKey: string }> }) {
  const { displayKey } = await params;
  const text = await request.text();
  if (text.length > 20_000) return new Response("Too much", { status: 413 });

  let counts: unknown;
  try {
    counts = JSON.parse(text)?.counts;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return new Response("Bad request", { status: 400 });

  const supabase = supabaseService();
  const hash = createHash("sha256").update(displayKey, "utf8").digest("hex");
  const { data: display } = await supabase
    .from("public_displays")
    .select("center_id")
    .eq("display_key_hash", hash)
    .eq("active", true)
    .maybeSingle();
  if (!display) return new Response("Unknown display", { status: 404 });

  await supabase.rpc("fets_count_shown" as never, { p_center: display.center_id, p_counts: counts } as never);
  return new Response(null, { status: 204 });
}
