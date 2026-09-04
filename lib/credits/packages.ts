/**
 * Stage 4B session package catalog helpers (pure).
 *
 * Prices are TWD from 2026-09-01. Seed lives in SQL; this module is the
 * display/purchase math used by UI and tests. Real bank details never belong here.
 */

import type { PackageCatalogBand } from "./debit-rules.ts";

export const PRIMARY_PACKAGE_CREDITS = [10, 20, 30] as const;
export type PrimaryPackageCredits = (typeof PRIMARY_PACKAGE_CREDITS)[number];

export const CATALOG_EFFECTIVE_FROM = "2026-09-01";

/** Seeded catalog (TWD). 1-packs exist for display/contribution; buy UI prefers 10/20/30. */
export const SEEDED_PACKAGE_PRICES: Record<
  PackageCatalogBand,
  Record<1 | 10 | 20 | 30, number>
> = {
  U8: { 1: 350, 10: 3500, 20: 7000, 30: 10000 },
  U10_U18: { 1: 500, 10: 4800, 20: 9000, 30: 12000 },
};

export function unitCostTwd(priceTwd: number, credits: number): number {
  if (!Number.isFinite(priceTwd) || !Number.isFinite(credits) || credits <= 0) {
    return 0;
  }
  return priceTwd / credits;
}

export function isPrimaryPurchasePackage(credits: number): boolean {
  return (PRIMARY_PACKAGE_CREDITS as readonly number[]).includes(credits);
}

const LAST5_RE = /^\d{5}$/;

export function parseLast5(value: string): string | null {
  const trimmed = value.trim();
  return LAST5_RE.test(trimmed) ? trimmed : null;
}

export function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim().replace(/^\+/, "");
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n)) {
    return null;
  }
  return n;
}

export function parsePackageCatalogBand(value: string): PackageCatalogBand | null {
  if (value === "U8" || value === "U10_U18") {
    return value;
  }
  return null;
}

export const MAX_ADJUST_REASON = 500;
export const MIN_ADJUST_REASON = 3;

export function parseAdjustReason(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < MIN_ADJUST_REASON) {
    return null;
  }
  return trimmed.slice(0, MAX_ADJUST_REASON);
}

export function contributionFromDebits(
  entries: ReadonlyArray<{ credits: number; unitCostTwd: number }>,
): number {
  return entries.reduce((sum, row) => sum + row.credits * row.unitCostTwd, 0);
}

export function parentContributionFromClaims(
  amountsTwd: readonly number[],
): number {
  return amountsTwd.reduce((sum, amount) => sum + amount, 0);
}
