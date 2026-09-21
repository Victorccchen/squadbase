import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { localeForRedirect } from "@/i18n/locale-for-redirect";
import { createClient } from "@/lib/supabase/server";
import { getPublicSupabaseEnv } from "@/lib/env";
import type { AppRole, Profile } from "@/lib/supabase/database.types";

export type AuthUser = {
  id: string;
  phone?: string | null;
};

function phoneFromClaim(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Per-request auth. Prefer local JWT claims over getUser() so layouts do not
 * wait on the Auth HTTP round-trip on every client navigation.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  if (!getPublicSupabaseEnv().isConfigured) {
    return null;
  }

  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsResult?.claims;
  const sub = claims?.sub;
  if (!claimsError && claims && typeof sub === "string" && sub.length > 0) {
    return {
      id: sub,
      phone: phoneFromClaim(claims.phone),
    };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return { id: data.user.id, phone: data.user.phone };
});

export async function requireUser() {
  const user = await getAuthUser();

  if (!user) {
    redirect({ href: "/login", locale: await localeForRedirect() });
    throw new Error("Unauthenticated");
  }

  return user;
}

export const loadOwnAccount = cache(async (
  userId: string,
): Promise<{
  profile: Profile | null;
  roles: AppRole[];
}> => {
  const supabase = await createClient();

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (!profile) {
    const { error: ensureError } = await supabase.rpc("ensure_own_profile");
    if (ensureError) {
      console.error("ensure_own_profile failed", ensureError.message);
    }
    const [{ data: createdProfile }, { data: createdRoles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    return {
      profile: createdProfile ?? null,
      roles: (createdRoles ?? roleRows ?? []).map((row) => row.role),
    };
  }

  return {
    profile,
    roles: (roleRows ?? []).map((row) => row.role),
  };
});

export const loadSignedInAccount = cache(async () => {
  const user = await requireUser();
  const account = await loadOwnAccount(user.id);
  return { user, ...account };
});
