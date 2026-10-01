import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Server-only service client for public display projections and authenticated roster sync.
 * Never import this module into a browser component.
 */
export function supabaseService() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
