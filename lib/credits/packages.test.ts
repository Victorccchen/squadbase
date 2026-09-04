import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SEEDED_PACKAGE_PRICES,
  contributionFromDebits,
  isPrimaryPurchasePackage,
  parentContributionFromClaims,
  parseAdjustReason,
  parseLast5,
  parsePositiveInt,
  unitCostTwd,
} from "./packages.ts";

describe("seeded prices from 2026-09-01", () => {
  it("matches the locked TWD table", () => {
    assert.equal(SEEDED_PACKAGE_PRICES.U8[1], 350);
    assert.equal(SEEDED_PACKAGE_PRICES.U8[10], 3500);
    assert.equal(SEEDED_PACKAGE_PRICES.U8[20], 7000);
    assert.equal(SEEDED_PACKAGE_PRICES.U8[30], 10000);
    assert.equal(SEEDED_PACKAGE_PRICES.U10_U18[1], 500);
    assert.equal(SEEDED_PACKAGE_PRICES.U10_U18[10], 4800);
    assert.equal(SEEDED_PACKAGE_PRICES.U10_U18[20], 9000);
    assert.equal(SEEDED_PACKAGE_PRICES.U10_U18[30], 12000);
  });

  it("treats 10/20/30 as primary buy options", () => {
    assert.equal(isPrimaryPurchasePackage(10), true);
    assert.equal(isPrimaryPurchasePackage(1), false);
  });
});

describe("unitCostTwd", () => {
  it("is order total divided by credits", () => {
    assert.equal(unitCostTwd(3500, 10), 350);
    assert.equal(unitCostTwd(4800, 10), 480);
    assert.equal(unitCostTwd(10000, 30), 10000 / 30);
    assert.equal(unitCostTwd(1200, 0), 0);
  });
});

describe("parseLast5", () => {
  it("accepts exactly five digits", () => {
    assert.equal(parseLast5("12345"), "12345");
    assert.equal(parseLast5(" 00001 "), "00001");
  });

  it("rejects other shapes", () => {
    assert.equal(parseLast5("1234"), null);
    assert.equal(parseLast5("123456"), null);
    assert.equal(parseLast5("12a45"), null);
    assert.equal(parseLast5(""), null);
  });
});

describe("parsePositiveInt", () => {
  it("accepts an optional leading plus", () => {
    assert.equal(parsePositiveInt("+10"), 10);
    assert.equal(parsePositiveInt("-1"), -1);
  });
});

describe("parseAdjustReason", () => {
  it("requires a short reason", () => {
    assert.equal(parseAdjustReason("ok"), null);
    assert.equal(parseAdjustReason("top-up correction"), "top-up correction");
  });
});

describe("contribution math", () => {
  it("sums parent approved amounts and player debit × unit cost", () => {
    assert.equal(parentContributionFromClaims([3500, 4800]), 8300);
    assert.equal(
      contributionFromDebits([
        { credits: 1, unitCostTwd: 350 },
        { credits: 2, unitCostTwd: 350 },
      ]),
      1050,
    );
  });
});
