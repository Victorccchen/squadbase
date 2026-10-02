"use server";

import { revalidatePath } from "next/cache";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { routing, type AppLocale } from "@/i18n/routing";
import { readString } from "@/lib/org/parse";
import type { OrgActionState } from "@/lib/org/errors";

/** Settings: the language the club uses for messages to this person (D6). */
export async function savePreferredLanguage(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false, errorKey: "notConfigured" };
  }
  const { user } = await loadSignedInAccount();
  if (!user) {
    return { ok: false, errorKey: "forbidden" };
  }

  const value = readString(formData, "preferred_language");
  if (!(routing.locales as readonly string[]).includes(value)) {
    return { ok: false, errorKey: "generic" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_preferred_language", {
    p_language: value as AppLocale,
  });
  if (error) {
    console.error("savePreferredLanguage", error.message);
    return { ok: false, errorKey: "generic" };
  }

  revalidatePath("/[locale]/app/settings", "page");
  return { ok: true, errorKey: null };
}
