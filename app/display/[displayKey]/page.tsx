import { notFound } from "next/navigation";
import { PublicDisplay } from "@/components/display/PublicDisplay";
import { supabaseService } from "@/lib/supabase/service";
import type { DisplayState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DisplayPage({ params }: { params: Promise<{ displayKey: string }> }) {
  const { displayKey } = await params;

  const { data } = await supabaseService().rpc("fets_display_state", { p_display_key: displayKey });
  const state = data as DisplayState | null;
  if (!state) notFound();

  return <PublicDisplay displayKey={displayKey} initial={state} />;
}
