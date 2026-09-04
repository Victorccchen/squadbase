import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogBandFromTeamAgeBand,
  computeSessionDebit,
  creditsApplyToAgeBand,
  isLowBalance,
} from "./debit-rules.ts";

const base = {
  noDebit: false,
  debitOverrideN: null as number | null,
  excusedLeaveApproved: false,
  alreadyDebitedSameMatchDay: false,
};

describe("catalogBandFromTeamAgeBand", () => {
  it("maps fee-paying youth bands and excludes U6/reserve/adult", () => {
    assert.equal(catalogBandFromTeamAgeBand("U8"), "U8");
    assert.equal(catalogBandFromTeamAgeBand("U10"), "U10_U18");
    assert.equal(catalogBandFromTeamAgeBand("U12"), "U10_U18");
    assert.equal(catalogBandFromTeamAgeBand("U15"), "U10_U18");
    assert.equal(catalogBandFromTeamAgeBand("U18"), "U10_U18");
    assert.equal(catalogBandFromTeamAgeBand("U6"), null);
    assert.equal(catalogBandFromTeamAgeBand("reserve"), null);
    assert.equal(catalogBandFromTeamAgeBand("senior"), null);
    assert.equal(creditsApplyToAgeBand("U8"), true);
    assert.equal(creditsApplyToAgeBand("U6"), false);
  });
});

describe("computeSessionDebit C2 regular", () => {
  it("debits 1 on present", () => {
    const result = computeSessionDebit({
      ...base,
      kind: "regular",
      teamAgeBand: "U8",
      attendanceStatus: "present",
    });
    assert.deepEqual(result, {
      credits: 1,
      entryType: "attend_debit",
      noDebitLabel: false,
    });
  });

  it("debits 1 on unexcused (no-show)", () => {
    const result = computeSessionDebit({
      ...base,
      kind: "regular",
      teamAgeBand: "U10",
      attendanceStatus: "unexcused_absent",
    });
    assert.equal(result.credits, 1);
    assert.equal(result.entryType, "no_show_debit");
  });

  it("debits 0 on excused", () => {
    const result = computeSessionDebit({
      ...base,
      kind: "regular",
      teamAgeBand: "U8",
      attendanceStatus: "excused_absent",
    });
    assert.equal(result.credits, 0);
    assert.equal(result.entryType, null);
  });
});

describe("computeSessionDebit C3 special", () => {
  it("debits 2 on present", () => {
    const result = computeSessionDebit({
      ...base,
      kind: "special",
      teamAgeBand: "U12",
      attendanceStatus: "present",
    });
    assert.equal(result.credits, 2);
    assert.equal(result.entryType, "attend_debit");
  });

  it("debits 2 on unexcused", () => {
    const result = computeSessionDebit({
      ...base,
      kind: "special",
      teamAgeBand: "U12",
      attendanceStatus: "unexcused_absent",
    });
    assert.equal(result.credits, 2);
    assert.equal(result.entryType, "no_show_debit");
  });

  it("debits 0 when excused leave is approved", () => {
    const result = computeSessionDebit({
      ...base,
      kind: "special",
      teamAgeBand: "U12",
      attendanceStatus: "present",
      excusedLeaveApproved: true,
    });
    assert.equal(result.credits, 0);
    assert.equal(result.entryType, null);
  });
});

describe("computeSessionDebit C4 cup/league", () => {
  it("debits 1 per competing player per day", () => {
    const cup = computeSessionDebit({
      ...base,
      kind: "cup",
      teamAgeBand: "U15",
      attendanceStatus: "present",
    });
    const league = computeSessionDebit({
      ...base,
      kind: "league",
      teamAgeBand: "U18",
      attendanceStatus: "present",
    });
    assert.deepEqual(cup, {
      credits: 1,
      entryType: "match_debit",
      noDebitLabel: false,
    });
    assert.equal(league.credits, 1);
    assert.equal(league.entryType, "match_debit");
  });

  it("skips a second match debit on the same club day", () => {
    const result = computeSessionDebit({
      ...base,
      kind: "cup",
      teamAgeBand: "U15",
      attendanceStatus: "present",
      alreadyDebitedSameMatchDay: true,
    });
    assert.equal(result.credits, 0);
    assert.equal(result.entryType, null);
  });
});

describe("computeSessionDebit C5 no-debit bands and flags", () => {
  it("never debits U6 / reserve / senior", () => {
    for (const band of ["U6", "reserve", "senior"] as const) {
      const result = computeSessionDebit({
        ...base,
        kind: "regular",
        teamAgeBand: band,
        attendanceStatus: "present",
      });
      assert.deepEqual(result, {
        credits: 0,
        entryType: null,
        noDebitLabel: true,
      });
    }
  });

  it("honours session no_debit and override", () => {
    const flagged = computeSessionDebit({
      ...base,
      kind: "regular",
      teamAgeBand: "U8",
      attendanceStatus: "present",
      noDebit: true,
    });
    assert.equal(flagged.credits, 0);
    assert.equal(flagged.noDebitLabel, true);

    const override = computeSessionDebit({
      ...base,
      kind: "regular",
      teamAgeBand: "U8",
      attendanceStatus: "present",
      debitOverrideN: 3,
    });
    assert.equal(override.credits, 3);
    assert.equal(override.entryType, "attend_debit");

    const zeroOverride = computeSessionDebit({
      ...base,
      kind: "special",
      teamAgeBand: "U8",
      attendanceStatus: "present",
      debitOverrideN: 0,
    });
    assert.equal(zeroOverride.credits, 0);
    assert.equal(zeroOverride.noDebitLabel, true);
  });
});

describe("isLowBalance", () => {
  it("is true at 0 or 1 remaining", () => {
    assert.equal(isLowBalance(0), true);
    assert.equal(isLowBalance(1), true);
    assert.equal(isLowBalance(2), false);
  });
});
