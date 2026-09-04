"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin, canTakeAttendance } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import {
  parseOptionalBoundedText,
  parseUuid,
  readString,
  creditRpcErrorKey,
} from "@/lib/org/parse";
import { type OrgActionState, type OrgErrorKey } from "@/lib/org/errors";
import {
  parseAdjustReason,
  parseLast5,
  parsePackageCatalogBand,
  parsePositiveInt,
} from "@/lib/credits/packages";
import { parseAttendanceStatus } from "@/lib/credits/debit-rules";
import type { LeaveRequestStatus, PaymentClaimStatus } from "@/lib/supabase/database.types";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

function ok(): OrgActionState {
  return { ok: true, errorKey: null };
}

function localeFromForm(formData: FormData) {
  return parseAppLocale(readString(formData, "locale"));
}

function revalidateCredits() {
  revalidatePath("/", "layout");
}

async function requireConfiguredUser() {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false as const, errorKey: "notConfigured" as const };
  }
  const account = await loadSignedInAccount();
  if (!account.user) {
    return { ok: false as const, errorKey: "forbidden" as const };
  }
  return { ok: true as const, ...account, supabase: await createClient() };
}

export async function submitPaymentClaim(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const playerId = parseUuid(readString(formData, "player_id"));
  const packageId = parseUuid(readString(formData, "package_id"));
  const last5 = parseLast5(readString(formData, "last5"));
  if (!playerId) {
    return fail("missingPlayer");
  }
  if (!packageId) {
    return fail("packageNotFound");
  }
  if (!last5) {
    return fail("invalidLast5");
  }

  const { error } = await actor.supabase.rpc("submit_payment_claim", {
    p_player_id: playerId,
    p_package_id: packageId,
    p_last5: last5,
  });

  if (error) {
    console.error("submitPaymentClaim", error.message);
    return fail(creditRpcErrorKey(error));
  }

  revalidateCredits();
  redirect({ href: "/app/credits", locale: localeFromForm(formData) });
  return ok();
}

export async function reviewPaymentClaim(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  if (!canAccessAdmin(actor.roles)) {
    return fail("forbidden");
  }

  const claimId = parseUuid(readString(formData, "claim_id"));
  const decision = readString(formData, "decision");
  const status: PaymentClaimStatus | null =
    decision === "approved" || decision === "rejected" ? decision : null;
  if (!claimId) {
    return fail("claimNotFound");
  }
  if (!status) {
    return fail("invalidDecision");
  }

  const { error } = await actor.supabase.rpc("admin_review_payment_claim", {
    p_claim_id: claimId,
    p_status: status,
    p_admin_note: parseOptionalBoundedText(readString(formData, "admin_note"), 1000),
  });

  if (error) {
    console.error("reviewPaymentClaim", error.message);
    return fail(creditRpcErrorKey(error));
  }

  revalidateCredits();
  redirect({ href: "/app/admin/claims", locale: localeFromForm(formData) });
  return ok();
}

export async function adjustSessionCredits(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  if (!canAccessAdmin(actor.roles)) {
    return fail("forbidden");
  }

  const playerId = parseUuid(readString(formData, "player_id"));
  const amount = parsePositiveInt(readString(formData, "amount"));
  const reason = parseAdjustReason(readString(formData, "reason"));
  if (!playerId) {
    return fail("missingPlayer");
  }
  if (amount === null || amount === 0) {
    return fail("invalidCreditAmount");
  }
  if (!reason) {
    return fail("reasonRequired");
  }

  const { error } = await actor.supabase.rpc("admin_adjust_session_credits", {
    p_player_id: playerId,
    p_amount: amount,
    p_reason: reason,
  });

  if (error) {
    console.error("adjustSessionCredits", error.message);
    return fail(creditRpcErrorKey(error));
  }

  revalidateCredits();
  redirect({ href: "/app/admin/credits", locale: localeFromForm(formData) });
  return ok();
}

export async function upsertSessionPackage(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  if (!canAccessAdmin(actor.roles)) {
    return fail("forbidden");
  }

  const idRaw = readString(formData, "package_id");
  const packageId = idRaw ? parseUuid(idRaw) : null;
  const ageBand = parsePackageCatalogBand(readString(formData, "age_band"));
  const credits = parsePositiveInt(readString(formData, "credits"));
  const price = parsePositiveInt(readString(formData, "price_twd"));
  const active = readString(formData, "active") !== "false";

  if (idRaw && !packageId) {
    return fail("packageNotFound");
  }
  if (!ageBand) {
    return fail("invalidPackageBand");
  }
  if (credits === null || credits <= 0) {
    return fail("invalidCreditAmount");
  }
  if (price === null || price < 0) {
    return fail("invalidPrice");
  }

  const { error } = await actor.supabase.rpc("admin_upsert_session_package", {
    p_id: packageId,
    p_age_band: ageBand,
    p_credits: credits,
    p_price_twd: price,
    p_active: active,
  });

  if (error) {
    console.error("upsertSessionPackage", error.message);
    return fail(creditRpcErrorKey(error));
  }

  revalidateCredits();
  redirect({ href: "/app/admin/credits", locale: localeFromForm(formData) });
  return ok();
}

export async function setBankTransferHint(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  if (!canAccessAdmin(actor.roles)) {
    return fail("forbidden");
  }

  const value = parseOptionalBoundedText(readString(formData, "bank_transfer_hint"), 2000) ?? "";
  const { error } = await actor.supabase.rpc("admin_set_club_setting", {
    p_key: "bank_transfer_hint",
    p_value: value,
  });

  if (error) {
    console.error("setBankTransferHint", error.message);
    return fail(creditRpcErrorKey(error));
  }

  revalidateCredits();
  redirect({ href: "/app/admin/credits", locale: localeFromForm(formData) });
  return ok();
}

export async function setSessionDebitOverride(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  if (!canAccessAdmin(actor.roles)) {
    return fail("forbidden");
  }

  const noDebit = readString(formData, "no_debit") === "true";
  const overrideRaw = readString(formData, "debit_override_n");
  let override: number | null = null;
  if (overrideRaw) {
    const parsed = parsePositiveInt(overrideRaw);
    if (parsed === null || parsed < 0) {
      return fail("invalidCreditAmount");
    }
    override = parsed;
  }

  const { error } = await actor.supabase.rpc("admin_set_session_debit_override", {
    p_session_id: sessionId,
    p_no_debit: noDebit,
    p_debit_override_n: override,
  });

  if (error) {
    console.error("setSessionDebitOverride", error.message);
    return fail(creditRpcErrorKey(error));
  }

  revalidateCredits();
  redirect({
    href: `/app/admin/sessions/${sessionId}`,
    locale: localeFromForm(formData),
  });
  return ok();
}

export async function markAttendance(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  if (!canTakeAttendance(actor.roles)) {
    return fail("forbidden");
  }

  const sessionId = parseUuid(readString(formData, "session_id"));
  const playerId = parseUuid(readString(formData, "player_id"));
  const status = parseAttendanceStatus(readString(formData, "status"));
  if (!sessionId) {
    return fail("missingSession");
  }
  if (!playerId) {
    return fail("missingPlayer");
  }
  if (!status) {
    return fail("generic");
  }

  const { error } = await actor.supabase.rpc("mark_session_attendance", {
    p_session_id: sessionId,
    p_player_id: playerId,
    p_status: status,
  });

  if (error) {
    console.error("markAttendance", error.message);
    return fail(creditRpcErrorKey(error));
  }

  revalidateCredits();
  const next = readString(formData, "next");
  if (next === "roster") {
    redirect({ href: `/app/roster/sessions/${sessionId}`, locale: localeFromForm(formData) });
  } else {
    redirect({ href: `/app/admin/sessions/${sessionId}`, locale: localeFromForm(formData) });
  }
  return ok();
}

export async function requestExcusedLeave(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const registrationId = parseUuid(readString(formData, "registration_id"));
  const sessionId = parseUuid(readString(formData, "session_id"));
  if (!registrationId) {
    return fail("generic");
  }

  const { error } = await actor.supabase.rpc("request_excused_leave", {
    p_registration_id: registrationId,
    p_parent_note: parseOptionalBoundedText(readString(formData, "parent_note"), 1000),
  });

  if (error) {
    console.error("requestExcusedLeave", error.message);
    return fail(creditRpcErrorKey(error));
  }

  revalidateCredits();
  redirect({
    href: sessionId ? `/app/sessions/${sessionId}` : "/app/sessions",
    locale: localeFromForm(formData),
  });
  return ok();
}

export async function reviewLeaveRequest(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  if (!canAccessAdmin(actor.roles)) {
    return fail("forbidden");
  }

  const requestId = parseUuid(readString(formData, "request_id"));
  const sessionId = parseUuid(readString(formData, "session_id"));
  const decision = readString(formData, "decision");
  const status: LeaveRequestStatus | null =
    decision === "approved" || decision === "rejected" ? decision : null;
  if (!requestId) {
    return fail("leaveNotFound");
  }
  if (!status) {
    return fail("invalidDecision");
  }

  const { error } = await actor.supabase.rpc("staff_review_leave_request", {
    p_request_id: requestId,
    p_status: status,
    p_admin_note: parseOptionalBoundedText(readString(formData, "admin_note"), 1000),
  });

  if (error) {
    console.error("reviewLeaveRequest", error.message);
    return fail(creditRpcErrorKey(error));
  }

  revalidateCredits();
  redirect({
    href: sessionId ? `/app/admin/sessions/${sessionId}` : "/app/admin/sessions",
    locale: localeFromForm(formData),
  });
  return ok();
}
