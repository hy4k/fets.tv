import { supabaseServer } from "@/lib/supabase/server";
import { MediaError, removeMedia, saveMedia } from "@/lib/media-store";
import type { MediaFolder } from "@/lib/media-path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Upload and delete for posters, ads and notice files. The same rule the
 * Supabase Storage policies used to enforce: a signed-in member of staff who
 * is not a viewer, working in their own centre's folder and nowhere else.
 */
async function staff(): Promise<{ centre: string } | Response> {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to upload files" }, { status: 401 });
  const { data: profile } = await db.from("profiles").select("role, center_id").eq("id", user.id).maybeSingle();
  if (!profile?.center_id || profile.role === "viewer") {
    return Response.json({ error: "Your account may not change what the TV shows" }, { status: 403 });
  }
  return { centre: profile.center_id };
}

function failed(e: unknown): Response {
  if (e instanceof MediaError) return Response.json({ error: e.message }, { status: e.status });
  console.error("media:", e);
  return Response.json({ error: "The file could not be saved. Try again." }, { status: 500 });
}

export async function POST(request: Request) {
  const who = await staff();
  if (who instanceof Response) return who;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const folder: MediaFolder = form.get("folder") === "slides" ? "slides" : "notices";
    if (!(file instanceof File) || file.size === 0) throw new MediaError("Choose a file to upload.");
    const saved = await saveMedia(who.centre, folder, file.type, Buffer.from(await file.arrayBuffer()));
    return Response.json(saved);
  } catch (e) {
    return failed(e);
  }
}

export async function DELETE(request: Request) {
  const who = await staff();
  if (who instanceof Response) return who;
  try {
    const path = new URL(request.url).searchParams.get("path") ?? "";
    await removeMedia(who.centre, path);
    return new Response(null, { status: 204 });
  } catch (e) {
    return failed(e);
  }
}
