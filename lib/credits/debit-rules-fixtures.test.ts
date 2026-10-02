import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  computeSessionDebit,
  isAtCreditLimit,
  isLateCancel,
  lateCancelDebit,
  owedCredits,
  parseLeaveReasonCategory,
  type ComputeDebitInput,
  type ComputeDebitResult,
} from "./debit-rules.ts";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "debit-rules.fixtures.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  cases: { name: string; input: ComputeDebitInput; expected: ComputeDebitResult }[];
};

describe("debit table fixture (shared with SQL, P06-7)", () => {
  it("has cases", () => {
    assert.ok(fixture.cases.length >= 15);
  });
  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      assert.deepEqual(computeSessionDebit(testCase.input), testCase.expected);
    });
  }
});

describe("late cancel (D2-1)", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  it("regular is never late", () => {
    assert.equal(isLateCancel({ kind: "regular", startsAt: "2026-10-10T02:00:00Z", now }), false);
  });
  it("matches and special sessions are late within 24 hours or after start", () => {
    assert.equal(isLateCancel({ kind: "cup", startsAt: "2026-10-11T06:00:00Z", now }), false);
    assert.equal(isLateCancel({ kind: "cup", startsAt: "2026-10-10T10:00:00Z", now }), true);
    assert.equal(isLateCancel({ kind: "special", startsAt: "2026-10-11T00:00:00Z", now }), true);
    assert.equal(isLateCancel({ kind: "league", startsAt: "2026-10-09T10:00:00Z", now }), true);
  });
  it("costs the no-show debit", () => {
    const base = { teamAgeBand: "U8" as const, noDebit: false, debitOverrideN: null };
    assert.equal(lateCancelDebit({ kind: "special", ...base }), 2);
    assert.equal(lateCancelDebit({ kind: "friendly", ...base }), 1);
    assert.equal(lateCancelDebit({ kind: "special", ...base, teamAgeBand: "U6" }), 0);
  });
});

describe("overdraft (D3)", () => {
  it("blocks sign-ups at 3 owed", () => {
    assert.equal(isAtCreditLimit(-2), false);
    assert.equal(isAtCreditLimit(-3), true);
    assert.equal(isAtCreditLimit(-4), true);
  });
  it("shows owed credits only below zero", () => {
    assert.equal(owedCredits(2), 0);
    assert.equal(owedCredits(0), 0);
    assert.equal(owedCredits(-3), 3);
  });
  it("parses leave reasons", () => {
    assert.equal(parseLeaveReasonCategory("illness"), "illness");
    assert.equal(parseLeaveReasonCategory("holiday"), null);
  });
});
