/**
 * Public runtime env only. Never read or commit a service role key.
 */
export type PublicAppEnv = "local" | "staging" | "production" | "unknown";

export function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  return {
    url,
    anonKey,
    isConfigured: url.length > 0 && anonKey.length > 0,
  };
}

export function getPublicAppEnv(): PublicAppEnv {
  const value = process.env.NEXT_PUBLIC_APP_ENV?.trim();
  if (value === "local" || value === "staging" || value === "production") {
    return value;
  }
  return "unknown";
}
