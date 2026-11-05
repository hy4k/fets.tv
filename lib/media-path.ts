/**
 * Posters, ads and notice files live on the app's own server (a Docker volume
 * on the Hostinger VPS), not in Supabase Storage, so showing them on the TVs
 * costs no Supabase egress. The database keeps only the path.
 *
 * A path is the centre's id, an optional "slides" folder, and a random name:
 *   <centre-id>/<uuid>.webp            a notice's file
 *   <centre-id>/slides/<uuid>.mp4      a TV Channel slide's file
 * The first segment is what the database functions check against the centre,
 * and the random name is what keeps a file's address from being guessed.
 * Nothing in here touches the disk, so the browser can use it too.
 */

export type MediaFolder = "notices" | "slides";
export type MediaExt = "webp" | "mp4" | "webm" | "pdf";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^(${UUID})/(slides/)?${UUID}\\.(webp|mp4|webm|pdf)$`);

export const CONTENT_TYPE: Record<MediaExt, string> = {
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
};

/** A path this app made, and nothing else: no "..", no other folders, no other types. */
export function isMediaPath(path: string | null | undefined): path is string {
  return typeof path === "string" && PATH.test(path);
}

export function centreOf(path: string): string | null {
  return PATH.exec(path)?.[1] ?? null;
}

export function extOf(path: string): MediaExt | null {
  return (PATH.exec(path)?.[3] as MediaExt | undefined) ?? null;
}

export function buildMediaPath(centre: string, folder: MediaFolder, id: string, ext: MediaExt): string {
  return `${centre}/${folder === "slides" ? "slides/" : ""}${id}.${ext}`;
}

/** Where the browser loads a file from. Null for anything that is not one of ours, such as a path left over from Supabase Storage. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!isMediaPath(path)) return null;
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/media/${path}`;
}

/**
 * One "bytes=" range, as a video player asks for. Null means send the whole
 * file; "invalid" means the range cannot be served (416).
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "") {
    // The last N bytes.
    const n = Number(m[2]);
    if (n === 0) return "invalid";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}
