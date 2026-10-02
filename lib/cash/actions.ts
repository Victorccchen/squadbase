"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin, canHandleCash } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { creditRpcErrorKey, parseUuid, readString } from "@/lib/org/parse";
import { inspectHeadshotBuffer } from "@/lib/org/player-photos";
import { isValidTaxId } from "@/lib/payments/model";
import { parseTwdAmount } from "@/lib/cash/model";
import { DEPOSIT_SLIPS_BUCKET } from "@/lib/cash/queries";
import type { RecordCashState } from "@/lib/cash/state";
import type { OrgActionState, OrgErrorKey } from "@/lib/org/errors";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

function localeOf(formData: FormData) {
  return parseAppLocale(readString(formData, "locale"));
}

function cashErrorKey(message: string): OrgErrorKey {
  if (message.includes("not authorized")) {
    return "forbidden";
  }
  if (message.includes("already closed")) {
    return "receiptAlreadyClosed";
  }
  if (message.includes("already voided")) {
    return "receiptAlreadyVoided";
  }
  if (message.includes("nothing to close")) {
    return "nothingToClose";
  }
  if (message.includes("already deposited")) {
    return "closingAlreadyDeposited";
  }
  if (message.includes("no closings selected")) {
    return "noClosingsSelected";
  }
  if (message.includes("own deposit")) {
    return "cannotReconcileOwnDeposit";
  }
  if (message.includes("does not match closings")) {
    return "depositAmountMismatch";
  }
  if (message.includes("invalid amount")) {
    return "invalidAmount";
  }
  if (message.includes("invalid tax id")) {
    return "invalidTaxId";
  }
  if (message.includes("invalid deposit date") || message.includes("invalid closing date")) {
    return "invalidTransferDate";
  }
  if (message.includes("item not found")) {
    return "missingItem";
  }
  return creditRpcErrorKey({ message });
}

async function requireCashHandler() {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false as const, errorKey: "notConfigured" as const };
  }
  const { user, roles } = await loadSignedInAccount();
  if (!user || !canHandleCash(roles)) {
    return { ok: false as const, errorKey: "forbidden" as const };
  }
  return { ok: true as const, user, supabase: await createClient() };
}

function revalidateCash() {
  revalidatePath("/[locale]/app/cash", "page");
  revalidatePath("/[locale]/app/admin/deposits", "page");
  revalidatePath("/[locale]/app/credits", "page");
}

/** PR-08b: the director takes cash; returns the receipt number for the parent. */
export async function recordCash(_prev: RecordCashState, formData: FormData): Promise<RecordCashState> {
  const failed = (errorKey: OrgErrorKey): RecordCashState => ({
    errorKey,
    receiptNo: null,
    amountTwd: null,
    creditsAvailable: null,
  });
  const actor = await requireCashHandler();
  if (!actor.ok) {
    return failed(actor.errorKey);
  }
  const playerId = parseUuid(readString(formData, "player_id"));
  const itemId = parseUuid(readString(formData, "item_id"));
  if (!playerId) {
    return failed("playerRequired");
  }
  if (!itemId) {
    return failed("missingItem");
  }
  const amountRaw = readString(formData, "amount_twd");
  const amount = amountRaw ? parseTwdAmount(amountRaw, 200000) : null;
  if (amountRaw && amount === null) {
    return failed("invalidAmount");
  }
  const invoiceNeeded = readString(formData, "invoice_needed") === "true";
  const taxId = invoiceNeeded ? readString(formData, "invoice_tax_id") : "";
  if (taxId && !isValidTaxId(taxId)) {
    return failed("invalidTaxId");
  }

  const { data, error } = await actor.supabase.rpc("director_record_cash", {
    p_player_id: playerId,
    p_item_id: itemId,
    p_amount_twd: amount,
    p_note: readString(formData, "note") || null,
    p_invoice_needed: invoiceNeeded,
    p_invoice_tax_id: taxId || null,
    p_invoice_title: invoiceNeeded ? readString(formData, "invoice_title") || null : null,
  });
  if (error) {
    console.error("recordCash", error.message);
    return failed(cashErrorKey(error.message));
  }
  const result = (data ?? {}) as Record<string, unknown>;
  revalidateCash();
  return {
    errorKey: null,
    receiptNo: typeof result.receipt_no === "string" ? result.receipt_no : null,
    amountTwd: typeof result.amount_twd === "number" ? result.amount_twd : null,
    creditsAvailable: typeof result.credits_available === "number" ? result.credits_available : null,
  };
}

export async function voidCashReceipt(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireCashHandler();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const receiptId = parseUuid(readString(formData, "receipt_id"));
  const reason = readString(formData, "reason");
  if (!receiptId) {
    return fail("generic");
  }
  if (reason.length < 2) {
    return fail("reasonRequired");
  }
  const { error } = await actor.supabase.rpc("director_void_cash_receipt", {
    p_receipt_id: receiptId,
    p_reason: reason,
  });
  if (error) {
    console.error("voidCashReceipt", error.message);
    return fail(cashErrorKey(error.message));
  }
  revalidateCash();
  redirect({ href: "/app/cash", locale: localeOf(formData) });
  return { ok: true, errorKey: null };
}

export async function closeCashDay(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireCashHandler();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const day = readString(formData, "day");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return fail("invalidTransferDate");
  }
  const { error } = await actor.supabase.rpc("director_close_cash_day", { p_day: day });
  if (error) {
    console.error("closeCashDay", error.message);
    return fail(cashErrorKey(error.message));
  }
  revalidateCash();
  redirect({ href: "/app/cash?closed=1", locale: localeOf(formData) });
  return { ok: true, errorKey: null };
}

export async function recordDeposit(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireCashHandler();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const closingIds = formData
    .getAll("closing_id")
    .map((value) => parseUuid(typeof value === "string" ? value : ""))
    .filter((value): value is string => Boolean(value));
  if (closingIds.length === 0) {
    return fail("noClosingsSelected");
  }
  const amount = parseTwdAmount(readString(formData, "amount_twd"));
  if (amount === null) {
    return fail("invalidAmount");
  }
  const depositDate = readString(formData, "deposit_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depositDate)) {
    return fail("invalidTransferDate");
  }

  let slipPath: string | null = null;
  const file = formData.get("slip");
  if (file instanceof File && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspected = inspectHeadshotBuffer(bytes);
    if (!inspected.ok) {
      return fail(inspected.errorKey);
    }
    const ext = inspected.mime === "image/png" ? "png" : inspected.mime === "image/webp" ? "webp" : "jpg";
    slipPath = `${actor.user.id}/slip-${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await actor.supabase.storage
      .from(DEPOSIT_SLIPS_BUCKET)
      .upload(slipPath, bytes, { contentType: inspected.mime, upsert: false });
    if (uploadError) {
      console.error("recordDeposit upload", uploadError.message);
      return fail("generic");
    }
  }

  const { error } = await actor.supabase.rpc("director_record_deposit", {
    p_deposit_date: depositDate,
    p_amount_twd: amount,
    p_closing_ids: closingIds,
    p_note: readString(formData, "note") || null,
    p_slip_path: slipPath,
  });
  if (error) {
    console.error("recordDeposit", error.message);
    return fail(cashErrorKey(error.message));
  }
  revalidateCash();
  redirect({ href: "/app/cash?deposited=1", locale: localeOf(formData) });
  return { ok: true, errorKey: null };
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

/** PR-08b: the second person (staff) checks a deposit against its closings. */
export async function reconcileDeposit(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const depositId = parseUuid(readString(formData, "deposit_id"));
  if (!depositId) {
    return fail("generic");
  }
  const { error } = await actor.supabase.rpc("staff_reconcile_deposit", { p_deposit_id: depositId });
  if (error) {
    console.error("reconcileDeposit", error.message);
    return fail(cashErrorKey(error.message));
  }
  revalidateCash();
  redirect({ href: "/app/admin/deposits", locale: localeOf(formData) });
  return { ok: true, errorKey: null };
}

export async function setDirector(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const userId = parseUuid(readString(formData, "user_id"));
  if (!userId) {
    return fail("profileRequired");
  }
  const { error } = await actor.supabase.rpc("admin_set_director", {
    p_user_id: userId,
    p_enabled: readString(formData, "enabled") === "true",
  });
  if (error) {
    console.error("setDirector", error.message);
    return fail(cashErrorKey(error.message));
  }
  revalidatePath("/[locale]/app/admin/deposits", "page");
  redirect({ href: "/app/admin/deposits", locale: localeOf(formData) });
  return { ok: true, errorKey: null };
}
