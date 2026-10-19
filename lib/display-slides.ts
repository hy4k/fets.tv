"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { TvSlide } from "@/lib/tv-channel";

const COLUMNS =
  "id, center_id, kind, label, fields, link, media_path, media_kind, seconds, starts_on, ends_on, days, from_time, to_time, everywhere, position, active";
// The scan code arrives with the stats SQL; read it when it is there.
const WITH_CODE = `${COLUMNS}, code`;

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
    const read = (columns: string) =>
      db
        .from("display_slides" as never)
        .select(columns)
        .or(`center_id.eq.${centerId},everywhere.eq.true`)
        .order("position");
    let { data, error } = await read(WITH_CODE);
    if (error) ({ data, error } = await read(COLUMNS));
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
    // A live update can go missing; the list never waits on one for long.
    const every = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearInterval(every);
      void supabaseBrowser().removeChannel(channel);
    };
  }, [load, centerId]);

  return { slides, loaded, ready, reload: load };
}

export type SlideNumbers = { shown: number; scans: number; shownToday: number; scansToday: number };

/**
 * How often each slide was on screen and how many phones scanned its QR code:
 * the last seven days at the centre, and today. Empty until the stats SQL is run.
 */
export function useSlideStats(centerId: string, today: string) {
  const [stats, setStats] = useState<Map<string, SlideNumbers>>(new Map());

  const load = useCallback(async () => {
    if (!today) return;
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabaseBrowser()
      .from("display_slide_stats" as never)
      .select("slide_id, day, shown, scans")
      .gte("day", since);
    if (error) return;
    const next = new Map<string, SlideNumbers>();
    for (const r of (data ?? []) as { slide_id: string; day: string; shown: number; scans: number }[]) {
      const n = next.get(r.slide_id) ?? { shown: 0, scans: 0, shownToday: 0, scansToday: 0 };
      n.shown += r.shown;
      n.scans += r.scans;
      if (r.day === today) {
        n.shownToday += r.shown;
        n.scansToday += r.scans;
      }
      next.set(r.slide_id, n);
    }
    setStats(next);
  }, [today]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const every = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(every);
  }, [load, centerId]);

  return stats;
}
