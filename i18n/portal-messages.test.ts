import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["zh-Hant", "en", "ja"] as const;

function loadMessages(locale: (typeof LOCALES)[number]): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, "messages", `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function leafPaths(value: unknown, prefix = ""): Map<string, string> {
  const leaves = new Map<string, string>();
  if (typeof value === "string") {
    leaves.set(prefix, value);
    return leaves;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`portal message at ${prefix || "<root>"} is not a string or object`);
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    for (const [childPath, childValue] of leafPaths(child, path)) {
      leaves.set(childPath, childValue);
    }
  }
  return leaves;
}

describe("portal message key parity", () => {
  it("has the same portal keys in zh-Hant, ja, and en, each a non-empty string", () => {
    const byLocale = LOCALES.map((locale) => {
      const portal = loadMessages(locale).portal;
      assert.ok(portal && typeof portal === "object", `${locale} missing portal namespace`);
      return { locale, leaves: leafPaths(portal, "portal") };
    });

    const [base, ...rest] = byLocale;
    assert.ok(base);
    assert.ok(base.leaves.size > 20, "portal namespace looks empty");

    for (const other of rest) {
      const missing = [...base.leaves.keys()].filter((key) => !other.leaves.has(key));
      const extra = [...other.leaves.keys()].filter((key) => !base.leaves.has(key));
      assert.deepEqual(missing, [], `${other.locale} missing portal keys`);
      assert.deepEqual(extra, [], `${other.locale} has extra portal keys`);
    }

    for (const { locale, leaves } of byLocale) {
      for (const [key, value] of leaves) {
        assert.equal(typeof value, "string", `${locale} ${key} is not a string`);
        assert.ok(value.trim().length > 0, `${locale} ${key} is empty`);
      }
    }
  });
});
