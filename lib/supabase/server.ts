import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types";

export async function supabaseServer() {
  const store = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          // Read-only in Server Components; middleware handles the refresh.
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {}
        },
      },
    },
  );
}
