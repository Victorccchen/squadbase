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

function leafKeys(value: unknown, prefix: string[]): string[][] {
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leafKeys(child, [...prefix, key]),
    );
  }
  return [prefix];
}

const zh = loadMessages("zh-Hant");
const REQUIRED_KEYS = [
  ...leafKeys(at(zh, ["payments"]), ["payments"]),
  ["credits", "reportSubmitted"],
  ["org", "errors", "invalidTransferDate"],
  ["org", "errors", "invalidAmount"],
  ["org", "errors", "invalidTaxId"],
  ["org", "errors", "missingItem"],
  ["org", "errors", "invoiceNumberInvalid"],
  ["org", "errors", "itemNameRequired"],
  ["tasks", "kinds", "invoice_pending"],
];

describe("payments messages (PR-08a)", () => {
  it("covers every item kind", () => {
    for (const kind of ["credit_package", "kit", "match_fee", "camp", "other"]) {
      assert.equal(typeof at(zh, ["payments", "kinds", kind]), "string", kind);
    }
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
