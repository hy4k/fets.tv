"use client";

import { useEffect, useRef } from "react";
import { basePath } from "@/lib/base-path";
import { useConsole } from "@/lib/console-data";
import { liveProviderOf } from "@/lib/fets-live";
import { todayInZone } from "@/lib/format";

/** How often a day brought in from fets.live is checked for late bookings. */
export const RESYNC_MS = 5 * 60 * 1000;

/**
 * Keeps a day brought in from fets.live up to date.
 *
 * Once today's list came from fets.live, every open console checks it again
 * every few minutes and quietly adds late bookings. The sync is safe to repeat
 * and never removes or resets anybody, so two desks doing it at once is only a
 * little wasted work. Nothing is said unless somebody new arrived on the list.
 */
export function RosterAutoSync() {
  const { center, session, profile, notify, refresh } = useConsole();
  const provider = liveProviderOf(session?.source_filename);
  const today = session?.exam_date === todayInZone(center.timezone);
  const on = !!provider && today && profile.role !== "viewer";
  const busy = useRef(false);

  useEffect(() => {
    if (!on) return;
    async function sync() {
      if (busy.current || document.visibilityState === "hidden") return;
      busy.current = true;
      try {
        const res = await fetch(`${basePath}/api/fets-live/roster`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        const body = await res.json().catch(() => null);
        if (res.ok && body?.inserted > 0) {
          notify(`${body.inserted} new booking${body.inserted === 1 ? "" : "s"} from fets.live`);
          await refresh();
        } else if (res.ok && body?.updated > 0) {
          await refresh();
        }
      } catch {
        // The next round tries again; a missed check is not worth a toast.
      } finally {
        busy.current = false;
      }
    }
    const timer = setInterval(sync, RESYNC_MS);
    return () => clearInterval(timer);
  }, [on, provider, notify, refresh]);

  return null;
}
