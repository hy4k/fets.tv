import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { buildMediaPath, centreOf, isMediaPath, type MediaExt, type MediaFolder } from "@/lib/media-path";

/** The Docker volume on the VPS (see docker-compose.yml). */
export const MEDIA_DIR = process.env.FETS_MEDIA_DIR ?? "/app/media";

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
/** A TV is 1920 wide; anything bigger is downloaded for nothing. */
const MAX_SIDE = 1920;

export type MediaKind = "image" | "video" | "file";

export class MediaError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

/**
 * What a file becomes on disk. Every picture is made a WebP no wider or taller
 * than a TV, so a 6 MB PNG straight from a design tool goes up as a few hundred
 * KB. An SVG is drawn into pixels too, so no script inside one is ever served.
 * Videos and PDFs are kept as they are, once their first bytes show they really
 * are what they claim to be.
 */
export async function prepare(type: string, bytes: Buffer): Promise<{ data: Buffer; ext: MediaExt; kind: MediaKind }> {
  if (IMAGE_TYPES.has(type)) {
    if (bytes.length > MAX_IMAGE_BYTES) throw new MediaError("That picture is larger than 25 MB.", 413);
    try {
      const data = await sharp(bytes, { animated: type === "image/gif" || type === "image/webp" })
        .rotate()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      return { data, ext: "webp", kind: "image" };
    } catch {
      throw new MediaError("That picture could not be read. Try saving it again as a PNG or JPEG.");
    }
  }
  if (type === "video/mp4" || type === "video/webm") {
    if (bytes.length > MAX_VIDEO_BYTES) throw new MediaError("That video is larger than 30 MB.", 413);
    const mp4 = bytes.subarray(4, 8).toString("latin1") === "ftyp";
    const webm = bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (type === "video/mp4" ? !mp4 : !webm) throw new MediaError("That file is not a playable MP4 or WebM video.");
    return { data: bytes, ext: type === "video/mp4" ? "mp4" : "webm", kind: "video" };
  }
  if (type === "application/pdf") {
    if (bytes.length > MAX_PDF_BYTES) throw new MediaError("That PDF is larger than 25 MB.", 413);
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new MediaError("That file is not a PDF.");
    return { data: bytes, ext: "pdf", kind: "file" };
  }
  throw new MediaError("Choose a picture (PNG, JPEG, WebP, GIF or SVG), an MP4 or WebM video, or a PDF.", 415);
}

export function fileOf(path: string): string {
  if (!isMediaPath(path)) throw new MediaError("Not a media path.", 404);
  // The volume is outside the build; nothing here should be traced into it.
  return join(/*turbopackIgnore: true*/ MEDIA_DIR, path);
}

/** Written under a temporary name and renamed, so a half-written file is never served. */
export async function saveMedia(
  centre: string,
  folder: MediaFolder,
  type: string,
  bytes: Buffer,
): Promise<{ path: string; kind: MediaKind; size: number }> {
  const { data, ext, kind } = await prepare(type, bytes);
  const path = buildMediaPath(centre, folder, randomUUID(), ext);
  const target = fileOf(path);
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.part`;
  await writeFile(temp, data);
  await rename(temp, target);
  return { path, kind, size: data.length };
}

/** Only ever inside the caller's own centre; a file that is already gone is fine. */
export async function removeMedia(centre: string, path: string): Promise<void> {
  if (!isMediaPath(path) || centreOf(path) !== centre) throw new MediaError("That file is not your centre's.", 403);
  try {
    await unlink(fileOf(path));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
