"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { parseUuid, readString } from "@/lib/org/parse";
import type { OrgActionState, OrgErrorKey } from "@/lib/org/errors";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

async function requireAdmin() {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false as const, errorKey: "notConfigured" as const };
  }
  const { user, roles } = await loadSignedInAccount();
  if (!user || !canAccessAdmin(roles)) {
    return { ok: false as const, errorKey: "forbidden" as const };
  }
  return { ok: true as const, supabase: await createClient() };
}

function rpcErrorKey(message: string): OrgErrorKey {
  if (message.includes("not authorized")) {
    return "forbidden";
  }
  if (message.includes("venue name required")) {
    return "venueNameRequired";
  }
  if (message.includes("session not found")) {
    return "sessionNotFound";
  }
  return "generic";
}

function done(formData: FormData, href: string): OrgActionState {
  revalidatePath("/[locale]/app/admin/venues", "page");
  redirect({ href, locale: parseAppLocale(readString(formData, "locale")) });
  return { ok: true, errorKey: null };
}

/** PR-07: create or edit a venue. */
export async function saveVenue(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const name = readString(formData, "name");
  if (!name) {
    return fail("venueNameRequired");
  }
  const { error } = await actor.supabase.rpc("admin_upsert_venue", {
    p_id: parseUuid(readString(formData, "venue_id")),
    p_name: name,
    p_address: readString(formData, "address") || null,
    p_active: readString(formData, "active") !== "false",
  });
  if (error) {
    console.error("saveVenue", error.message);
    return fail(rpcErrorKey(error.message));
  }
  return done(formData, "/app/admin/venues");
}

/** PR-07: new token; the printed QR stops working at once. */
export async function regenerateVenueToken(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const venueId = parseUuid(readString(formData, "venue_id"));
  if (!venueId) {
    return fail("generic");
  }
  const { error } = await actor.supabase.rpc("admin_regenerate_venue_token", { p_id: venueId });
  if (error) {
    console.error("regenerateVenueToken", error.message);
    return fail(rpcErrorKey(error.message));
  }
  return done(formData, "/app/admin/venues");
}
