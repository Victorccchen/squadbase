import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicSupabaseEnv } from "@/lib/env";
import type { AppRole, Profile } from "@/lib/supabase/database.types";

export async function getAuthUser() {
  if (!getPublicSupabaseEnv().isConfigured) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function requireUser() {
  const user = await getAuthUser();

  if (!user) {
    const locale = await getLocale();
    redirect({ href: "/login", locale });
    throw new Error("Unauthenticated");
  }

  return user;
}

export async function loadOwnAccount(userId: string): Promise<{
  profile: Profile | null;
  roles: AppRole[];
}> {
  const supabase = await createClient();

  const { error: ensureError } = await supabase.rpc("ensure_own_profile");
  if (ensureError) {
    console.error("ensure_own_profile failed", ensureError.message);
  }

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  return {
    profile: profile ?? null,
    roles: (roleRows ?? []).map((row) => row.role),
  };
}

export async function loadSignedInAccount() {
  const user = await requireUser();
  const account = await loadOwnAccount(user.id);
  return { user, ...account };
}
