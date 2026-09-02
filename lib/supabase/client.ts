import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@/lib/env";

/**
 * Browser Supabase client. Reads only the public URL and anon key.
 * Do not import a service role key into client bundles.
 */
export function createClient() {
  const { url, anonKey, isConfigured } = getPublicSupabaseEnv();

  if (!isConfigured) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createBrowserClient(url, anonKey);
}
