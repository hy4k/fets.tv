import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withSignedMedia } from "@/lib/notice-media";
import type { TvSlide } from "@/lib/tv-channel";
import type { DisplayState } from "@/lib/types";

/** As long as a notice's link: a TV is left on all day and re-reads often. */
const SIGNED_URL_SECONDS = 60 * 60 * 6;

const COLUMNS =
  "id, center_id, kind, label, fields, link, media_path, media_kind, seconds, starts_on, ends_on, days, from_time, to_time, everywhere, position, active";

/**
 * The slides a TV may play: this centre's and those set for every centre,
 * switched on and not yet over. Which of them is on right now the TV decides
 * from its own clock, so a slide starts and stops on the minute without a
 * push from here. Poster files get a signed link, as a notice's does.
 */
export async function displaySlides(supabase: SupabaseClient, centerId: string): Promise<TvSlide[]> {
  // A day's grace either side of the server's date covers every time zone.
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const read = (columns: string) =>
    supabase
      .from("display_slides")
      .select(columns)
      .eq("active", true)
      .or(`center_id.eq.${centerId},everywhere.eq.true`)
      .order("position")
      .limit(100);
  let { data, error } = await read(`${COLUMNS}, code`);
  // The scan code comes with the stats SQL; without it, the slides alone.
  if (error) ({ data, error } = await read(COLUMNS));
  // Before the TV Channel SQL is run there is no table: no slides.
  if (error || !data) return [];

  // Over is over; one filter in the query, the date here, keeps the query simple.
  const slides = (data as unknown as TvSlide[]).filter((s) => !s.ends_on || s.ends_on >= yesterday);
  const paths = slides.map((s) => s.media_path).filter((p): p is string => !!p);
  if (paths.length === 0) return slides;

  const { data: signed } = await supabase.storage.from("notice-media").createSignedUrls(paths, SIGNED_URL_SECONDS);
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  // The storage key says where things live and is no use to the browser.
  return slides.map((s) => ({ ...s, media_url: s.media_path ? (url.get(s.media_path) ?? null) : null, media_path: null }));
}

/** Everything one TV shows: the board's state, its notice's file signed, and the slides. */
export async function loadDisplayState(
  supabase: SupabaseClient,
  displayKey: string,
  centerId?: string,
): Promise<DisplayState | null> {
  const { data } = await supabase.rpc("fets_display_state", { p_display_key: displayKey });
  const state = await withSignedMedia(supabase, data as DisplayState | null);
  if (!state) return null;

  let center = centerId;
  if (!center) {
    const hash = createHash("sha256").update(displayKey, "utf8").digest("hex");
    const { data: display } = await supabase
      .from("public_displays")
      .select("center_id")
      .eq("display_key_hash", hash)
      .eq("active", true)
      .maybeSingle();
    center = (display as { center_id: string } | null)?.center_id;
  }
  return { ...state, slides: center ? await displaySlides(supabase, center) : [] };
}
