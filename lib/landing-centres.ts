import { supabaseService } from "@/lib/supabase/service";

export type FrontDoorCentre = { id: string; name: string; site_code: string; timezone: string };

/**
 * The centres to choose between at the front door.
 *
 * Read on the server with the service key, because nobody has signed in yet
 * and RLS rightly shows an anonymous visitor nothing. Only names and site
 * codes leave — the same things printed on the door of each centre.
 */
export async function frontDoorCentres(): Promise<FrontDoorCentre[]> {
  try {
    const { data } = await supabaseService()
      .from("centers")
      .select("id, name, site_code, timezone")
      .eq("active", true)
      .order("name");
    return data ?? [];
  } catch {
    return [];
  }
}
