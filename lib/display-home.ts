"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BoardHome } from "@/lib/types";

/** The centre's TV home screen, kept fresh when another console changes it. */
export function useDisplayHome(centerId: string) {
  const [home, setHome] = useState<BoardHome | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const db = supabaseBrowser();
    const first = await db
      .from("display_home" as never)
      .select(
        "layout, title, subtitle, show_exams, show_early, show_welcome, show_seats, seats_free_label, seats_used_label, exams_label, exams_empty, early_text, full_text, lines, call_sound",
      )
      .eq("center_id", centerId)
      .maybeSingle();
    let data = first.data;
    // Before the home screen switches are installed, read what there is.
    if (first.error) {
      ({ data } = await db
        .from("display_home" as never)
        .select("layout, title, subtitle, show_exams, show_early")
        .eq("center_id", centerId)
        .maybeSingle());
    }
    setHome((data as BoardHome | null) ?? null);
    setLoaded(true);
  }, [centerId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const channel = supabaseBrowser()
      .channel(`display-home-${centerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "display_home", filter: `center_id=eq.${centerId}` }, () => void load())
      .subscribe();
    return () => {
      void supabaseBrowser().removeChannel(channel);
    };
  }, [load, centerId]);

  return { home, loaded, reload: load };
}
