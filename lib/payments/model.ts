/**
 * Phase 1 PR-08a payment report helpers (pure).
 *
 * The database checks everything again (submit_payment_report); these keep the
 * form honest and the messages specific.
 */

import type { PackageCatalogBand } from "../credits/debit-rules.ts";
import type { PaymentItem, PaymentItemKind } from "../supabase/database.types.ts";

export const PAYMENT_ITEM_KINDS: readonly PaymentItemKind[] = [
  "credit_package",
  "kit",
  "match_fee",
  "camp",
  "other",
];
export const STAFF_ITEM_KINDS: readonly Exclude<PaymentItemKind, "credit_package">[] = [
  "kit",
  "match_fee",
  "camp",
  "other",
];

export const MAX_PAYMENT_TWD = 200000;
export const TRANSFER_DATE_MAX_AGE_DAYS = 90;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export function isStaffItemKind(value: string): value is Exclude<PaymentItemKind, "credit_package"> {
  return (STAFF_ITEM_KINDS as readonly string[]).includes(value);
}

/** Item name in the page language, falling back to Chinese. */
export function paymentItemName(item: Pick<PaymentItem, "name_i18n">, locale: string): string {
  const names = item.name_i18n ?? {};
  return names[locale]?.trim() || names["zh-Hant"]?.trim() || "";
}

/** Items a child can pay for: their band's credit packages plus every other active item. */
export function itemsForChild<T extends Pick<PaymentItem, "kind" | "package_id" | "active" | "sort_order">>(
  items: readonly T[],
  packageBandById: ReadonlyMap<string, PackageCatalogBand>,
  childBand: PackageCatalogBand | null,
): T[] {
  return items
    .filter((item) => item.active)
    .filter((item) =>
      item.kind === "credit_package"
        ? childBand !== null && item.package_id !== null && packageBandById.get(item.package_id) === childBand
        : true,
    )
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function isValidTaxId(value: string): boolean {
  return /^[0-9]{8}$/.test(value);
}

function isoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type PaymentReportInput = {
  playerId: string;
  itemId: string;
  itemKind: PaymentItemKind;
  amountRaw: string;
  transferDate: string;
  last5: string;
  invoiceNeeded: boolean;
  taxId: string;
  title: string;
  /** Club calendar date (Asia/Taipei), YYYY-MM-DD. */
  today: string;
};

export type PaymentReportErrorKey =
  | "invalidLast5"
  | "invalidTransferDate"
  | "invalidAmount"
  | "invalidTaxId"
  | "missingItem";

export type ParsedPaymentReport = {
  playerId: string;
  itemId: string;
  /** Null for credit packages: the package price applies. */
  amountTwd: number | null;
  transferDate: string;
  last5: string;
  invoiceNeeded: boolean;
  taxId: string | null;
  title: string | null;
};

export function parsePaymentReport(
  input: PaymentReportInput,
): { ok: true; report: ParsedPaymentReport } | { ok: false; errorKey: PaymentReportErrorKey } {
  if (!input.itemId) {
    return { ok: false, errorKey: "missingItem" };
  }
  if (!/^[0-9]{5}$/.test(input.last5.trim())) {
    return { ok: false, errorKey: "invalidLast5" };
  }
  const date = input.transferDate.trim();
  if (!isoDate(date) || date > input.today || daysBetween(date, input.today) > TRANSFER_DATE_MAX_AGE_DAYS) {
    return { ok: false, errorKey: "invalidTransferDate" };
  }

  let amountTwd: number | null = null;
  if (input.itemKind !== "credit_package") {
    const raw = input.amountRaw.replace(/[,\s]/g, "");
    if (!/^\d{1,6}$/.test(raw)) {
      return { ok: false, errorKey: "invalidAmount" };
    }
    amountTwd = Number(raw);
    if (amountTwd <= 0 || amountTwd > MAX_PAYMENT_TWD) {
      return { ok: false, errorKey: "invalidAmount" };
    }
  }

  const taxId = input.invoiceNeeded ? input.taxId.trim() : "";
  if (taxId && !isValidTaxId(taxId)) {
    return { ok: false, errorKey: "invalidTaxId" };
  }
  const title = input.invoiceNeeded ? input.title.trim().slice(0, 100) : "";

  return {
    ok: true,
    report: {
      playerId: input.playerId,
      itemId: input.itemId,
      amountTwd,
      transferDate: date,
      last5: input.last5.trim(),
      invoiceNeeded: input.invoiceNeeded,
      taxId: taxId || null,
      title: title || null,
    },
  };
}

/** Object path for a proof screenshot; the first folder is the child (storage policy). */
export function proofObjectPath(playerId: string, ext: "jpg" | "png" | "webp", now: number, id: string): string {
  return `${playerId}/proof-${now}-${id}.${ext}`;
}
