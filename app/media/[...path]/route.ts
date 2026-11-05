import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { fileOf } from "@/lib/media-store";
import { CONTENT_TYPE, extOf, isMediaPath, parseRange } from "@/lib/media-path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serves a poster, ad or notice file from the server's own disk. A file never
 * changes once written (a new upload gets a new name), so the browser is told
 * to keep it for a year: each TV downloads each file once, not every time it
 * comes round. Open to anyone who has the address, as the TV is; the random
 * name is what keeps addresses from being guessed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  const ext = isMediaPath(path) ? extOf(path) : null;
  if (!ext) return new Response("Not found", { status: 404 });

  let size: number;
  let mtime: number;
  try {
    const s = await stat(fileOf(path));
    if (!s.isFile()) return new Response("Not found", { status: 404 });
    size = s.size;
    mtime = s.mtimeMs;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const etag = `"${size.toString(16)}-${Math.floor(mtime).toString(16)}"`;
  const headers = new Headers({
    "Content-Type": CONTENT_TYPE[ext],
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  });

  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const range = parseRange(request.headers.get("range"), size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  const { start, end } = range ?? { start: 0, end: size - 1 };
  headers.set("Content-Length", String(end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });

  const body = Readable.toWeb(createReadStream(fileOf(path), { start, end })) as ReadableStream<Uint8Array>;
  return new Response(body, { status: range ? 206 : 200, headers });
}

export const HEAD = GET;
