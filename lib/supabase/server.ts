import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server Supabase client for Server Components, Server Actions, and Route Handlers.
 * Cookie writes may fail in read-only Server Components; that is expected.
 * Session refresh is handled in proxy.ts.
 */
export async function createClient() {
  const { url, anonKey, isConfigured } = getPublicSupabaseEnv();

  if (!isConfigured) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always persist cookies.
        }
      },
    },
  });
}
