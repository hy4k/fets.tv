import type { SupabaseClient } from "@supabase/supabase-js";
import type { DisplayState } from "@/lib/types";
import { stableSignedUrls } from "@/lib/signed-url-cache";

/** Long enough for a TV that is left on all day, short enough to expire. */
const SIGNED_URL_SECONDS = 60 * 60 * 6;

/**
 * Swaps the notice's storage key for a link the TV's browser can actually load.
 *
 * The bucket is private, so nothing in it is reachable by guessing an address.
 * Only the server, holding the service key, can mint a link, and only for the
 * message that is up right now. The link is reused between pushes, so the TV's
 * browser keeps its cached copy instead of downloading the file every minute.
 */
export async function withSignedMedia(
  supabase: SupabaseClient,
  state: DisplayState | null,
): Promise<DisplayState | null> {
  if (!state?.notice?.media_path) return state;

  const path = state.notice.media_path;
  const signed = await stableSignedUrls(supabase, "notice-media", [path], SIGNED_URL_SECONDS);

  return {
    ...state,
    notice: {
      ...state.notice,
      // The key itself is of no use to the browser and says where things live,
      // so it does not travel any further than this.
      media_path: null,
      media_url: signed.get(path) ?? null,
    },
  };
}
