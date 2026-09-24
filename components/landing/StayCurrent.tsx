"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-reads the schedule once a minute.
 *
 * The page is meant to be left open on the desk, and the list is rendered on
 * the server, so without this "Upcoming" would never become "In progress" and
 * after midnight the date would move on while yesterday's exams stayed. A
 * refresh re-runs the server render without reloading the page or the clock.
 */
export function StayCurrent({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
