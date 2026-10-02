import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isValidTaxId,
  itemsForChild,
  parsePaymentReport,
  paymentItemName,
  proofObjectPath,
} from "./model.ts";

const base = {
  playerId: "p1",
  itemId: "i1",
  itemKind: "kit" as const,
  amountRaw: "800",
  transferDate: "2026-10-01",
  last5: "12345",
  invoiceNeeded: false,
  taxId: "",
  title: "",
  today: "2026-10-02",
};

describe("payment report parsing (PR-08a)", () => {
  it("accepts a kit report", () => {
    const parsed = parsePaymentReport(base);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok && parsed.report, {
      playerId: "p1",
      itemId: "i1",
      amountTwd: 800,
      transferDate: "2026-10-01",
      last5: "12345",
      invoiceNeeded: false,
      taxId: null,
      title: null,
    });
  });

  it("ignores the amount for credit packages", () => {
    const parsed = parsePaymentReport({ ...base, itemKind: "credit_package", amountRaw: "" });
    assert.equal(parsed.ok && parsed.report.amountTwd, null);
  });

  it("rejects bad last5, dates and amounts", () => {
    assert.deepEqual(parsePaymentReport({ ...base, last5: "1234" }), { ok: false, errorKey: "invalidLast5" });
    assert.deepEqual(parsePaymentReport({ ...base, transferDate: "2026-10-03" }), {
      ok: false,
      errorKey: "invalidTransferDate",
    });
    assert.deepEqual(parsePaymentReport({ ...base, transferDate: "2026-02-30" }), {
      ok: false,
      errorKey: "invalidTransferDate",
    });
    assert.deepEqual(parsePaymentReport({ ...base, transferDate: "2026-06-01" }), {
      ok: false,
      errorKey: "invalidTransferDate",
    });
    assert.deepEqual(parsePaymentReport({ ...base, amountRaw: "0" }), { ok: false, errorKey: "invalidAmount" });
    assert.deepEqual(parsePaymentReport({ ...base, amountRaw: "abc" }), { ok: false, errorKey: "invalidAmount" });
    assert.equal(parsePaymentReport({ ...base, amountRaw: "1,200" }).ok, true);
  });

  it("checks invoice fields only when an invoice is wanted", () => {
    assert.deepEqual(parsePaymentReport({ ...base, invoiceNeeded: true, taxId: "123" }), {
      ok: false,
      errorKey: "invalidTaxId",
    });
    const parsed = parsePaymentReport({ ...base, invoiceNeeded: true, taxId: "12345678", title: " Co " });
    assert.equal(parsed.ok && parsed.report.taxId, "12345678");
    assert.equal(parsed.ok && parsed.report.title, "Co");
    const ignored = parsePaymentReport({ ...base, taxId: "123", title: "x" });
    assert.equal(ignored.ok && ignored.report.taxId, null);
    assert.equal(isValidTaxId("1234567a"), false);
  });
});

describe("payment items", () => {
  const items = [
    { id: "k", kind: "kit" as const, package_id: null, active: true, sort_order: 5, name_i18n: { "zh-Hant": "球衣", en: "Kit" } },
    { id: "u8", kind: "credit_package" as const, package_id: "pk8", active: true, sort_order: 10, name_i18n: { "zh-Hant": "U8 10 堂" } },
    { id: "u10", kind: "credit_package" as const, package_id: "pk10", active: true, sort_order: 10, name_i18n: { "zh-Hant": "U10" } },
    { id: "off", kind: "camp" as const, package_id: null, active: false, sort_order: 1, name_i18n: { "zh-Hant": "營隊" } },
  ];
  const bands = new Map([
    ["pk8", "U8" as const],
    ["pk10", "U10_U18" as const],
  ]);

  it("lists the child's packages and the other active items", () => {
    assert.deepEqual(itemsForChild(items, bands, "U8").map((item) => item.id), ["k", "u8"]);
    assert.deepEqual(itemsForChild(items, bands, null).map((item) => item.id), ["k"]);
  });

  it("names items in the page language", () => {
    assert.equal(paymentItemName(items[0]!, "en"), "Kit");
    assert.equal(paymentItemName(items[0]!, "ja"), "球衣");
  });

  it("puts proofs in the child's folder", () => {
    assert.equal(proofObjectPath("p1", "jpg", 5, "abc"), "p1/proof-5-abc.jpg");
  });
});
