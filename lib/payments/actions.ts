"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { creditRpcErrorKey, parseUuid, readString } from "@/lib/org/parse";
import { inspectHeadshotBuffer } from "@/lib/org/player-photos";
import { clubTodayDate } from "@/lib/org/session-calendar";
import { isStaffItemKind, parsePaymentReport, proofObjectPath } from "@/lib/payments/model";
import { PAYMENT_PROOFS_BUCKET } from "@/lib/payments/queries";
import type { OrgActionState, OrgErrorKey } from "@/lib/org/errors";
import type { PaymentItemKind } from "@/lib/supabase/database.types";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

function localeOf(formData: FormData) {
  return parseAppLocale(readString(formData, "locale"));
}

function paymentErrorKey(message: string): OrgErrorKey {
  if (message.includes("invalid transfer date")) {
    return "invalidTransferDate";
  }
  if (message.includes("invalid amount")) {
    return "invalidAmount";
  }
  if (message.includes("invalid tax id")) {
    return "invalidTaxId";
  }
  if (message.includes("invalid screenshot path")) {
    return "invalidPhotoType";
  }
  if (message.includes("item not found")) {
    return "missingItem";
  }
  if (message.includes("invalid invoice number")) {
    return "invoiceNumberInvalid";
  }
  if (message.includes("item name required")) {
    return "itemNameRequired";
  }
  return creditRpcErrorKey({ message });
}

/** PR-08a: parent's transfer report ("匯款回報") with optional proof and invoice request. */
export async function submitPaymentReport(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return fail("notConfigured");
  }
  const { user } = await loadSignedInAccount();
  if (!user) {
    return fail("forbidden");
  }
  const supabase = await createClient();

  const playerId = parseUuid(readString(formData, "player_id"));
  const itemId = parseUuid(readString(formData, "item_id"));
  if (!playerId) {
    return fail("playerRequired");
  }
  if (!itemId) {
    return fail("missingItem");
  }
  const { data: item } = await supabase
    .from("payment_items")
    .select("id, kind")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) {
    return fail("missingItem");
  }

  const parsed = parsePaymentReport({
    playerId,
    itemId,
    itemKind: item.kind as PaymentItemKind,
    amountRaw: readString(formData, "amount_twd"),
    transferDate: readString(formData, "transfer_date"),
    last5: readString(formData, "last5"),
    invoiceNeeded: readString(formData, "invoice_needed") === "true",
    taxId: readString(formData, "invoice_tax_id"),
    title: readString(formData, "invoice_title"),
    today: clubTodayDate(),
  });
  if (!parsed.ok) {
    return fail(parsed.errorKey);
  }

  let screenshotPath: string | null = null;
  const file = formData.get("screenshot");
  if (file instanceof File && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspected = inspectHeadshotBuffer(bytes);
    if (!inspected.ok) {
      return fail(inspected.errorKey);
    }
    const ext = inspected.mime === "image/png" ? "png" : inspected.mime === "image/webp" ? "webp" : "jpg";
    screenshotPath = proofObjectPath(playerId, ext, Date.now(), crypto.randomUUID());
    const { error: uploadError } = await supabase.storage
      .from(PAYMENT_PROOFS_BUCKET)
      .upload(screenshotPath, bytes, { contentType: inspected.mime, upsert: false });
    if (uploadError) {
      console.error("submitPaymentReport upload", uploadError.message);
      return fail("generic");
    }
  }

  const report = parsed.report;
  const { error } = await supabase.rpc("submit_payment_report", {
    p_player_id: report.playerId,
    p_item_id: report.itemId,
    p_amount_twd: report.amountTwd,
    p_transfer_date: report.transferDate,
    p_last5: report.last5,
    p_invoice_needed: report.invoiceNeeded,
    p_invoice_tax_id: report.taxId,
    p_invoice_title: report.title,
    p_screenshot_path: screenshotPath,
  });
  if (error) {
    console.error("submitPaymentReport", error.message);
    return fail(paymentErrorKey(error.message));
  }

  revalidatePath("/[locale]/app/credits", "page");
  redirect({ href: "/app/credits?reported=1", locale: localeOf(formData) });
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

/** PR-08a: staff-managed items (kit, match fee, camp, other). */
export async function savePaymentItem(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const kind = readString(formData, "kind");
  if (!isStaffItemKind(kind)) {
    return fail("generic");
  }
  const nameZh = readString(formData, "name_zh");
  if (!nameZh) {
    return fail("itemNameRequired");
  }
  const priceRaw = readString(formData, "price_twd").replace(/[,\s]/g, "");
  if (priceRaw && !/^\d{1,6}$/.test(priceRaw)) {
    return fail("invalidAmount");
  }
  const { error } = await actor.supabase.rpc("admin_upsert_payment_item", {
    p_id: parseUuid(readString(formData, "item_id")),
    p_kind: kind,
    p_name_zh: nameZh,
    p_name_ja: readString(formData, "name_ja") || null,
    p_name_en: readString(formData, "name_en") || null,
    p_price_twd: priceRaw ? Number(priceRaw) : null,
    p_active: readString(formData, "active") !== "false",
  });
  if (error) {
    console.error("savePaymentItem", error.message);
    return fail(paymentErrorKey(error.message));
  }
  revalidatePath("/[locale]/app/admin/credits", "page");
  redirect({ href: "/app/admin/credits", locale: localeOf(formData) });
  return { ok: true, errorKey: null };
}

/** PR-08a: record the number of an invoice issued the usual way (D14). */
export async function recordInvoice(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const invoiceId = parseUuid(readString(formData, "invoice_id"));
  const invoiceNo = readString(formData, "invoice_no").toUpperCase();
  if (!invoiceId) {
    return fail("generic");
  }
  if (!/^[A-Z0-9-]{2,20}$/.test(invoiceNo)) {
    return fail("invoiceNumberInvalid");
  }
  const { error } = await actor.supabase.rpc("admin_record_invoice", {
    p_invoice_id: invoiceId,
    p_invoice_no: invoiceNo,
  });
  if (error) {
    console.error("recordInvoice", error.message);
    return fail(paymentErrorKey(error.message));
  }
  revalidatePath("/[locale]/app/admin/claims", "page");
  redirect({ href: "/app/admin/claims", locale: localeOf(formData) });
  return { ok: true, errorKey: null };
}
