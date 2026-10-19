import type { NextRequest } from "next/server";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/** Where a phone goes when a code is unknown or counting fails: never a dead end. */
const FALLBACK = "https://fets.in/";

/**
 * A QR code on the hall TV lands here: one scan is counted for the slide, and
 * the phone goes straight on to the slide's own link. Nothing is shown and
 * nothing about the phone is kept — only the count for the day.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let target = FALLBACK;
  if (/^[a-z0-9]{6,16}$/i.test(code)) {
    try {
      const { data } = await supabaseService().rpc("fets_count_scan" as never, { p_code: code } as never);
      if (typeof data === "string" && /^https?:\/\//i.test(data)) target = data;
    } catch {
      // Counting is a nice-to-have; getting the phone to the page is not.
    }
  }
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
