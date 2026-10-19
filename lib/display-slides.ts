"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { TvSlide } from "@/lib/tv-channel";

const COLUMNS =
  "id, center_id, kind, label, fields, link, media_path, media_kind, seconds, starts_on, ends_on, days, from_time, to_time, everywhere, position, active";

/**
 * The centre's TV Channel slides, kept fresh when another console changes
 * them. Poster files are signed for this browser, so the console shows the
 * same picture the TV does.
 */
export function useDisplaySlides(centerId: string) {
  const [slides, setSlides] = useState<TvSlide[]>([]);
  const [loaded, setLoaded] = useState(false);
  // False until the TV Channel SQL is run.
  const [ready, setReady] = useState(true);

  const load = useCallback(async () => {
    const db = supabaseBrowser();
    const { data, error } = await db
      .from("display_slides" as never)
      .select(COLUMNS)
      .or(`center_id.eq.${centerId},everywhere.eq.true`)
      .order("position");
    if (error) {
      setReady(false);
      setLoaded(true);
      return;
    }
    const rows = (data ?? []) as TvSlide[];
    const paths = rows.map((s) => s.media_path).filter((p): p is string => !!p);
    const url = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await db.storage.from("notice-media").createSignedUrls(paths, 60 * 60);
      for (const s of signed ?? []) if (s.path && s.signedUrl) url.set(s.path, s.signedUrl);
    }
    setSlides(rows.map((s) => ({ ...s, media_url: s.media_path ? (url.get(s.media_path) ?? null) : null })));
    setReady(true);
    setLoaded(true);
  }, [centerId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const channel = supabaseBrowser()
      .channel(`display-slides-${centerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "display_slides" }, () => void load())
      .subscribe();
    return () => {
      void supabaseBrowser().removeChannel(channel);
    };
  }, [load, centerId]);

  return { slides, loaded, ready, reload: load };
}
