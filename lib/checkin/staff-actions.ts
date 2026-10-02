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
  if (message.includes("invalid headcount")) {
    return "headcountInvalid";
  }
  if (message.includes("reason required")) {
    return "reasonRequired";
  }
  if (message.includes("attendance not found")) {
    return "attendanceNotFound";
  }
  if (message.includes("session not found")) {
    return "sessionNotFound";
  }
  return "generic";
}

function backToSession(formData: FormData, sessionId: string): OrgActionState {
  revalidatePath("/[locale]/app/admin/sessions/[id]", "page");
  redirect({
    href: `/app/admin/sessions/${sessionId}`,
    locale: parseAppLocale(readString(formData, "locale")),
  });
  return { ok: true, errorKey: null };
}

/** PR-07: staff record the head count ("清點完成"). */
export async function confirmHeadcount(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const sessionId = parseUuid(readString(formData, "session_id"));
  const raw = readString(formData, "headcount");
  const headcount = /^\d{1,3}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!sessionId) {
    return fail("sessionNotFound");
  }
  if (!Number.isInteger(headcount) || headcount > 500) {
    return fail("headcountInvalid");
  }
  const { error } = await actor.supabase.rpc("staff_confirm_headcount", {
    p_session_id: sessionId,
    p_headcount: headcount,
  });
  if (error) {
    console.error("confirmHeadcount", error.message);
    return fail(rpcErrorKey(error.message));
  }
  return backToSession(formData, sessionId);
}

/** PR-07: "checked in but did not come": delete the record and reverse the debit. */
export async function removeCheckin(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const sessionId = parseUuid(readString(formData, "session_id"));
  const playerId = parseUuid(readString(formData, "player_id"));
  const reason = readString(formData, "reason");
  if (!sessionId || !playerId) {
    return fail("attendanceNotFound");
  }
  if (reason.length < 2) {
    return fail("reasonRequired");
  }
  const { error } = await actor.supabase.rpc("staff_remove_checkin", {
    p_session_id: sessionId,
    p_player_id: playerId,
    p_reason: reason,
  });
  if (error) {
    console.error("removeCheckin", error.message);
    return fail(rpcErrorKey(error.message));
  }
  return backToSession(formData, sessionId);
}

/** PR-07: which venue QR applies to this session (or this and later ones in the series). */
export async function setSessionVenue(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const sessionId = parseUuid(readString(formData, "session_id"));
  if (!sessionId) {
    return fail("sessionNotFound");
  }
  const { error } = await actor.supabase.rpc("admin_set_session_venue", {
    p_session_id: sessionId,
    p_venue_id: parseUuid(readString(formData, "venue_id")),
    p_whole_series: readString(formData, "whole_series") === "true",
  });
  if (error) {
    console.error("setSessionVenue", error.message);
    return fail(rpcErrorKey(error.message));
  }
  return backToSession(formData, sessionId);
}
