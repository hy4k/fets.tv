"use client";

import type { MediaFolder } from "@/lib/media-path";

/** Kept in step with lib/media-store.ts, so the console can say no before uploading. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 30 * 1024 * 1024;

export function tooLarge(file: File): string | null {
  const video = file.type.startsWith("video/");
  if (file.size > (video ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES)) {
    return video ? "That video is larger than 30 MB." : "That file is larger than 25 MB.";
  }
  return null;
}

const api = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/media`;

/** Sends a file to the app's own server. Pictures come back as a WebP no larger than the TV. */
export async function uploadMedia(file: File, folder: MediaFolder): Promise<{ path: string; kind: "image" | "video" | "file" }> {
  const big = tooLarge(file);
  if (big) throw new Error(big);
  const form = new FormData();
  form.set("file", file);
  form.set("folder", folder);
  const res = await fetch(api, { method: "POST", body: form });
  if (res.status === 413) {
    // nginx on the server answers before the app does when its own limit is lower.
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "The server refused a file this large. Its upload limit (client_max_body_size) needs raising.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.path) throw new Error(body?.error ?? "The file could not be uploaded. Try again.");
  return body;
}

/** Best effort: a file left behind costs a little disk, never a broken screen. */
export function deleteMedia(path: string | null | undefined): void {
  if (!path) return;
  void fetch(`${api}?path=${encodeURIComponent(path)}`, { method: "DELETE" }).catch(() => {});
}
