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

/**
 * Server-only transfer instructions. Never commit a real account number.
 * Prefer admin-saved `club_runtime_settings.bank_transfer_hint` at runtime.
 */
export function getEnvBankTransferHint(): string {
  return process.env.BANK_TRANSFER_HINT?.trim() ?? "";
}

/** Public origin for LINE signup links. Placeholder host only in git. */
export function getAppOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/\/$/, "")}`;
  }
  return "";
}
