import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { withSignedMedia } from "@/lib/notice-media";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * Server-sent events for one public TV. The display client never talks to
 * Postgres: this route validates the display key, subscribes on the server and
 * forwards only the safe projection returned by fets_display_state.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ displayKey: string }> }) {
  const { displayKey } = await params;
  const supabase = supabaseService();

  const hash = createHash("sha256").update(displayKey, "utf8").digest("hex");
  const { data: display } = await supabase
    .from("public_displays")
    .select("id, center_id")
    .eq("display_key_hash", hash)
    .eq("active", true)
    .maybeSingle();

  if (!display) return new Response("Unknown display", { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let pending: ReturnType<typeof setTimeout> | null = null;

      const push = async () => {
        if (closed) return;
        const { data } = await supabase.rpc("fets_display_state", { p_display_key: displayKey });
        if (closed || !data) return;
        const state = await withSignedMedia(supabase, data);
        if (closed || !state) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(state)}\n\n`));
      };

      const schedulePush = () => {
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => void push(), 80);
      };

      const channel = supabase.channel(`fets:display:${display.id}`);
      const filter = `center_id=eq.${display.center_id}`;
      for (const table of ["public_display_calls", "candidates", "centers", "display_notices"]) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: table === "centers" ? `id=eq.${display.center_id}` : filter },
          schedulePush,
        );
      }
      channel.subscribe();

      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
      }, 25_000);

      void push();

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (pending) clearTimeout(pending);
        clearInterval(heartbeat);
        void supabase.removeChannel(channel);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
