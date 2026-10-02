import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CREDIT_LEDGER_ENTRY_TYPES } from "../lib/credits/debit-rules.ts";

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

/** Every string leaf under a namespace, as key paths. */
function leaves(value: unknown, path: string[]): string[][] {
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => leaves(child, [...path, key]));
  }
  return [path];
}

const zh = loadMessages("zh-Hant");
const REQUIRED_KEYS = [
  ...leaves(at(zh, ["paperCards"]), ["paperCards"]),
  ...CREDIT_LEDGER_ENTRY_TYPES.map((type) => ["reports", "ledgerTypes", type]),
  ["nav", "paperCards"],
  ["admin", "paperCardsTitle"],
  ["admin", "paperCardsBody"],
  ["tasks", "kinds", "paper_card_mismatch"],
  ["org", "errors", "paperCardAlreadyConfirmed"],
  ["org", "errors", "paperCardPackageRequired"],
  ["org", "errors", "paperCardRemainingInvalid"],
  ["org", "errors", "paperCardFutureDate"],
  ["org", "errors", "paperCardTooManyDates"],
  ["org", "errors", "paperCardPhotosRequired"],
];

describe("paper card messages (PR-09)", () => {
  it("covers the paperCards namespace, flags and problems included", () => {
    assert.ok(REQUIRED_KEYS.length > 70);
    for (const flag of ["aiUnsure", "noSession", "future", "duplicate", "unreadable"]) {
      assert.equal(typeof at(zh, ["paperCards", "flags", flag]), "string", flag);
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
