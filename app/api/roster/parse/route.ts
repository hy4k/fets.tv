import type { NextRequest } from "next/server";
import { parseRosterFile } from "@/lib/roster/parse";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") {
    return Response.json({ error: "Only an admin can import a roster" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file uploaded" }, { status: 400 });

  if (!/\.(csv|xlsx)$/i.test(file.name)) {
    return Response.json({ error: "Upload a .csv or .xlsx roster" }, { status: 415 });
  }

  if (file.size > MAX_BYTES) {
    return Response.json({ error: "That file is larger than 8 MB" }, { status: 413 });
  }

  try {
    const preview = await parseRosterFile(file.name, Buffer.from(await file.arrayBuffer()));
    return Response.json(preview);
  } catch (error) {
    // The reason matters — "is it a valid spreadsheet?" told nobody anything.
    // This is the library's own complaint about the file's structure, which
    // carries no candidate data.
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Could not read that file: ${reason.slice(0, 200)}` },
      { status: 422 },
    );
  }
}
