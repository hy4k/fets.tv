import type { DisplayState } from "@/lib/types";
import { mediaUrl } from "@/lib/media-path";

/**
 * Swaps the notice's stored path for the address the TV's browser loads it
 * from: the app's own server, never Supabase Storage. The path itself says
 * where things live and goes no further than this.
 */
export function withMediaUrl(state: DisplayState | null): DisplayState | null {
  if (!state?.notice?.media_path) return state;
  return {
    ...state,
    notice: {
      ...state.notice,
      media_path: null,
      media_url: mediaUrl(state.notice.media_path),
    },
  };
}
