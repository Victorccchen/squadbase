import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { paymentsTable, tableHasPiiHeaders, type PaymentSourceRow, type ReportCopy } from "./reports.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function copyFor(locale: string): ReportCopy {
  const bundle = JSON.parse(readFileSync(join(root, "messages", `${locale}.json`), "utf8"));
  return {
    columns: bundle.reports.columns,
    paymentMethods: bundle.reports.paymentMethods,
    invoiceNotNeeded: bundle.reports.invoiceNotNeeded,
    invoicePending: bundle.reports.invoicePending,
  } as ReportCopy;
}

const player = { name_zh: "王小明", name_en_given: "Ming", name_en_family: "Wang", name_ja: null };
const rows: PaymentSourceRow[] = [
  {
    at: "2026-10-02T03:00:00Z",
    method: "cash",
    reference: "C-20261002-001",
    player,
    itemName: "U8 堂數 10 堂",
    amountTwd: 3500,
    invoiceNeeded: true,
    invoiceNo: null,
  },
  {
    at: "2026-10-01T03:00:00Z",
    method: "transfer",
    reference: "T-abcdef12",
    player,
    itemName: "球衣",
    amountTwd: 800,
    invoiceNeeded: false,
    invoiceNo: null,
  },
];

describe("payments report (PR-08b, P08-6)", () => {
  for (const locale of ["zh-Hant", "ja", "en"]) {
    it(`${locale}: headers, order and invoice status, no PII columns`, () => {
      const table = paymentsTable(rows, copyFor(locale), locale);
      assert.equal(table.length, 3);
      assert.equal(table[0]!.length, 7);
      assert.equal(tableHasPiiHeaders(table), false);
      assert.equal(table[1]![2], "T-abcdef12");
      assert.equal(table[2]![5], "3500");
      assert.equal(table[2]![6], copyFor(locale).invoicePending);
      assert.equal(table[1]![6], copyFor(locale).invoiceNotNeeded);
    });
  }

  it("shows the invoice number once issued", () => {
    const table = paymentsTable([{ ...rows[0]!, invoiceNo: "AB-12345678" }], copyFor("en"), "en");
    assert.equal(table[1]![6], "AB-12345678");
  });
});
