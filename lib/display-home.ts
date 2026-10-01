"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BoardHome } from "@/lib/types";

/** The centre's TV home screen, kept fresh when another console changes it. */
export function useDisplayHome(centerId: string) {
  const [home, setHome] = useState<BoardHome | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser()
      .from("display_home" as never)
      .select("layout, title, subtitle, show_exams, show_early")
      .eq("center_id", centerId)
      .maybeSingle();
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
