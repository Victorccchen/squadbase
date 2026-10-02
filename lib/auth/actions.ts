"use server";

import { createClient } from "@/lib/supabase/server";
import { getPublicSupabaseEnv } from "@/lib/env";
import { classifyAuthError, type AuthErrorKey } from "@/lib/auth/errors";
import { isE164 } from "@/lib/auth/phone";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { parseAppLocale } from "@/i18n/routing";

export type AuthActionResult = {
  ok: boolean;
  errorKey: AuthErrorKey | null;
};

function missingConfig(): AuthActionResult {
  return { ok: false, errorKey: "notConfigured" };
}

export async function requestPhoneOtp(phone: string): Promise<AuthActionResult> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return missingConfig();
  }

  if (!isE164(phone)) {
    return { ok: false, errorKey: "invalidPhone" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { channel: "sms" },
  });

  if (error) {
    return { ok: false, errorKey: classifyAuthError(error) };
  }

  return { ok: true, errorKey: null };
}

export async function verifyPhoneOtp(
  phone: string,
  token: string,
): Promise<AuthActionResult> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return missingConfig();
  }

  if (!isE164(phone)) {
    return { ok: false, errorKey: "invalidPhone" };
  }

  const code = token.replace(/\D/g, "");
  if (code.length < 4 || code.length > 10) {
    return { ok: false, errorKey: "invalidOtp" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token: code,
    type: "sms",
  });

  if (error) {
    return { ok: false, errorKey: classifyAuthError(error) };
  }

  const { error: profileError } = await supabase.rpc("ensure_own_profile");
  if (profileError) {
    console.error("ensure_own_profile after OTP failed", profileError.message);
  }

  // First sign-in records the language of the page they signed in from (D6);
  // later sign-ins keep whatever they chose.
  const locale = parseAppLocale(await getLocale());
  const { error: languageError } = await supabase.rpc("set_preferred_language", {
    p_language: locale,
    p_only_if_unset: true,
  });
  if (languageError) {
    console.error("set_preferred_language after OTP failed", languageError.message);
  }

  return { ok: true, errorKey: null };
}

export async function signOut() {
  if (getPublicSupabaseEnv().isConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  const locale = await getLocale();
  redirect({ href: "/login", locale });
}
