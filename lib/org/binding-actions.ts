"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { todayInClubTimeZone, formatIsoDate } from "@/lib/age-band";
import {
  isOpenGuardianLinkViolation,
  parseGuardianRelation,
  parseGuardianSearch,
  parseLinkDecision,
  parseLinkNote,
  parseUuid,
  readString,
} from "@/lib/org/parse";
import {
  INITIAL_SEARCH_PLAYERS_STATE,
  type OrgActionState,
  type OrgErrorKey,
  type SearchPlayersState,
} from "@/lib/org/errors";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

function ok(): OrgActionState {
  return { ok: true, errorKey: null };
}

function localeFromForm(formData: FormData) {
  return parseAppLocale(readString(formData, "locale"));
}

function revalidateBindings() {
  revalidatePath("/", "layout");
}

export async function searchPlayerForLink(
  _prev: SearchPlayersState,
  formData: FormData,
): Promise<SearchPlayersState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ...INITIAL_SEARCH_PLAYERS_STATE, errorKey: "notConfigured" };
  }

  const { user } = await loadSignedInAccount();
  if (!user) {
    return { ...INITIAL_SEARCH_PLAYERS_STATE, errorKey: "forbidden" };
  }

  const today = formatIsoDate(todayInClubTimeZone());
  const parsed = parseGuardianSearch(formData, today);
  if (!parsed.ok) {
    return { ok: false, errorKey: parsed.errorKey, matches: [], searched: true };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_player_for_guardian_link", {
    p_team_id: parsed.fields.teamId,
    p_jersey: parsed.fields.jersey,
    p_birth_date: parsed.fields.birthDate,
    p_name_fragment: parsed.fields.nameFragment || null,
  });

  if (error) {
    console.error("searchPlayerForLink", error.message);
    return { ok: false, errorKey: "generic", matches: [], searched: true };
  }

  const matches = data ?? [];
  if (matches.length === 0) {
    return { ok: false, errorKey: "noPlayerMatch", matches: [], searched: true };
  }

  return { ok: true, errorKey: null, matches, searched: true };
}

export async function requestGuardianLink(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return fail("notConfigured");
  }

  const { user } = await loadSignedInAccount();
  const playerId = parseUuid(readString(formData, "player_id"));
  const relation = parseGuardianRelation(readString(formData, "relation"));
  const parentNote = parseLinkNote(readString(formData, "parent_note"));

  if (!playerId) {
    return fail("playerRequired");
  }
  if (!relation) {
    return fail("invalidRelation");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("guardian_player_links").insert({
    guardian_user_id: user.id,
    player_id: playerId,
    relation,
    status: "pending",
    parent_note: parentNote,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) {
    if (isOpenGuardianLinkViolation(error)) {
      return fail("linkAlreadyOpen");
    }
    console.error("requestGuardianLink", error.message);
    return fail("generic");
  }

  revalidateBindings();
  redirect({ href: "/app/children", locale: localeFromForm(formData) });
  return ok();
}

export async function reviewGuardianLink(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return fail("notConfigured");
  }

  const { roles } = await loadSignedInAccount();
  if (!canAccessAdmin(roles)) {
    return fail("forbidden");
  }

  const linkId = parseUuid(readString(formData, "link_id"));
  const decision = parseLinkDecision(readString(formData, "decision"));
  const adminNote = parseLinkNote(readString(formData, "admin_note"));

  if (!linkId) {
    return fail("generic");
  }
  if (!decision) {
    return fail("invalidDecision");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_guardian_link", {
    p_link_id: linkId,
    p_status: decision,
    p_admin_note: adminNote,
  });

  if (error) {
    console.error("reviewGuardianLink", error.message);
    return fail("generic");
  }

  revalidateBindings();
  redirect({ href: "/app/admin/bindings", locale: localeFromForm(formData) });
  return ok();
}
