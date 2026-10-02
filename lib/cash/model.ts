/**
 * Phase 1 PR-08b cash helpers (pure). The database enforces the rules; these
 * keep the director's phone screens honest and explain refusals early.
 */

export const RECEIPT_NO_PATTERN = /^C-\d{8}-\d{3,}$/;

export function isReceiptNo(value: string): boolean {
  return RECEIPT_NO_PATTERN.test(value);
}

/** Club date (YYYY-MM-DD) a receipt number belongs to. */
export function receiptNoDate(value: string): string | null {
  if (!isReceiptNo(value)) {
    return null;
  }
  const digits = value.slice(2, 10);
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export type ReceiptLike = {
  amount_twd: number;
  received_on: string;
  closing_id: string | null;
  voided_at: string | null;
};

/** Open (not closed, not voided) receipts grouped by club date, newest first. */
export function openReceiptDays<T extends ReceiptLike>(
  receipts: readonly T[],
): { date: string; count: number; total: number; receipts: T[] }[] {
  const byDay = new Map<string, T[]>();
  for (const receipt of receipts) {
    if (receipt.closing_id || receipt.voided_at) {
      continue;
    }
    byDay.set(receipt.received_on, [...(byDay.get(receipt.received_on) ?? []), receipt]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, rows]) => ({
      date,
      count: rows.length,
      total: rows.reduce((sum, row) => sum + row.amount_twd, 0),
      receipts: rows,
    }));
}

export type ReconcileBlock = "ownDeposit" | "alreadyReconciled" | "amountMismatch" | null;

/** Why staff cannot reconcile this deposit yet (mirrors staff_reconcile_deposit). */
export function reconcileBlock(input: {
  userId: string;
  recordedBy: string;
  reconciledAt: string | null;
  amountTwd: number;
  closingTotals: readonly number[];
}): ReconcileBlock {
  if (input.reconciledAt) {
    return "alreadyReconciled";
  }
  if (input.userId === input.recordedBy) {
    return "ownDeposit";
  }
  const total = input.closingTotals.reduce((sum, value) => sum + value, 0);
  return total === input.amountTwd ? null : "amountMismatch";
}

export function parseTwdAmount(raw: string, max = 10_000_000): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!/^\d{1,8}$/.test(cleaned)) {
    return null;
  }
  const value = Number(cleaned);
  return value > 0 && value <= max ? value : null;
}

export type CashPlayerOption = {
  id: string;
  label: string;
  searchText: string;
};

/** Case-insensitive match on any name or team, for the director's search box. */
export function filterCashPlayers<T extends Pick<CashPlayerOption, "searchText">>(
  players: readonly T[],
  query: string,
  limit = 20,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return players.filter((player) => player.searchText.toLowerCase().includes(needle)).slice(0, limit);
}
