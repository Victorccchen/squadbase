import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadMessages(locale: "zh-Hant" | "en" | "ja"): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, "messages", `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function at(source: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    return (value as Record<string, unknown>)[key];
  }, source);
}

const zh = loadMessages("zh-Hant");
const REQUIRED_KEYS = [
  ...Object.keys(at(zh, ["cash"]) as Record<string, unknown>).map((key) => ["cash", key]),
  ["app", "roles", "director"],
  ["app", "directorSection"],
  ["app", "openCash"],
  ["app", "placeholders", "cash", "title"],
  ["app", "placeholders", "cash", "body"],
  ["nav", "cash"],
  ["nav", "deposits"],
  ["reports", "types", "payments"],
  ["reports", "typeHint", "payments"],
  ["reports", "paymentMethods", "transfer"],
  ["reports", "paymentMethods", "cash"],
  ["reports", "invoiceNotNeeded"],
  ["reports", "invoicePending"],
  ["credits", "cashReceiptsTitle"],
  ["credits", "cashReceiptNo"],
  ["credits", "cashReceiptVoided"],
  ["org", "errors", "receiptAlreadyClosed"],
  ["org", "errors", "receiptAlreadyVoided"],
  ["org", "errors", "nothingToClose"],
  ["org", "errors", "closingAlreadyDeposited"],
  ["org", "errors", "noClosingsSelected"],
  ["org", "errors", "cannotReconcileOwnDeposit"],
  ["org", "errors", "depositAmountMismatch"],
  ["tasks", "kinds", "cash_close_day"],
  ["tasks", "kinds", "cash_deposit_due"],
  ["tasks", "kinds", "deposit_reconcile"],
];

describe("cash messages (PR-08b)", () => {
  it("covers the cash namespace", () => {
    assert.ok(REQUIRED_KEYS.length > 50);
  });
  for (const locale of ["zh-Hant", "en", "ja"] as const) {
    it(`${locale} has every key as a non-empty string`, () => {
      const messages = loadMessages(locale);
      for (const key of REQUIRED_KEYS) {
        const value = at(messages, key);
        assert.equal(typeof value, "string", `${locale}: ${key.join(".")}`);
        assert.ok((value as string).trim().length > 0, `${locale}: ${key.join(".")}`);
      }
    });
  }
});
