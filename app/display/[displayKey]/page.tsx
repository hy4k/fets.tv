import { notFound } from "next/navigation";
import { PublicDisplay } from "@/components/display/PublicDisplay";
import { supabaseService } from "@/lib/supabase/service";
import { loadDisplayState } from "@/lib/tv-channel-server";

export const dynamic = "force-dynamic";

export default async function DisplayPage({ params }: { params: Promise<{ displayKey: string }> }) {
  const { displayKey } = await params;

  const state = await loadDisplayState(supabaseService(), displayKey);
  if (!state) notFound();

  return <PublicDisplay displayKey={displayKey} initial={state} />;
}
