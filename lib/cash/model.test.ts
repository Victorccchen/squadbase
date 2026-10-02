import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterCashPlayers,
  isReceiptNo,
  openReceiptDays,
  parseTwdAmount,
  receiptNoDate,
  reconcileBlock,
} from "./model.ts";

describe("cash model (PR-08b)", () => {
  it("reads receipt numbers", () => {
    assert.equal(isReceiptNo("C-20261002-001"), true);
    assert.equal(isReceiptNo("C-20261002-1"), false);
    assert.equal(receiptNoDate("C-20261002-012"), "2026-10-02");
    assert.equal(receiptNoDate("X"), null);
  });

  it("groups open receipts by day", () => {
    const days = openReceiptDays([
      { amount_twd: 3500, received_on: "2026-10-01", closing_id: null, voided_at: null },
      { amount_twd: 800, received_on: "2026-10-02", closing_id: null, voided_at: null },
      { amount_twd: 500, received_on: "2026-10-02", closing_id: null, voided_at: null },
      { amount_twd: 999, received_on: "2026-10-02", closing_id: null, voided_at: "2026-10-02T01:00:00Z" },
      { amount_twd: 999, received_on: "2026-10-02", closing_id: "c1", voided_at: null },
    ]);
    assert.deepEqual(
      days.map(({ date, count, total }) => ({ date, count, total })),
      [
        { date: "2026-10-02", count: 2, total: 1300 },
        { date: "2026-10-01", count: 1, total: 3500 },
      ],
    );
  });

  it("explains why a deposit cannot be reconciled (P08-5)", () => {
    const base = { userId: "kaori", recordedBy: "director", reconciledAt: null, amountTwd: 4300, closingTotals: [3500, 800] };
    assert.equal(reconcileBlock(base), null);
    assert.equal(reconcileBlock({ ...base, userId: "director" }), "ownDeposit");
    assert.equal(reconcileBlock({ ...base, amountTwd: 4200 }), "amountMismatch");
    assert.equal(reconcileBlock({ ...base, reconciledAt: "2026-10-02T00:00:00Z" }), "alreadyReconciled");
  });

  it("parses amounts and filters players", () => {
    assert.equal(parseTwdAmount("3,500"), 3500);
    assert.equal(parseTwdAmount("0"), null);
    assert.equal(parseTwdAmount("12x"), null);
    const players = [
      { id: "1", label: "王小明", searchText: "王小明 Ming Wang 梯隊 U8" },
      { id: "2", label: "林", searchText: "林 Lin 梯隊 U10" },
    ];
    assert.deepEqual(filterCashPlayers(players, "ming").map((p) => p.id), ["1"]);
    assert.deepEqual(filterCashPlayers(players, "u10").map((p) => p.id), ["2"]);
    assert.deepEqual(filterCashPlayers(players, " "), []);
  });
});
