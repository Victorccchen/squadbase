import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["zh-Hant", "en", "ja"] as const;

function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, "messages", `${locale}.json`), "utf8"));
}

function leaves(value: unknown, prefix: string, out = new Map<string, unknown>()) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      leaves(child, `${prefix}.${key}`, out);
    }
  } else {
    out.set(prefix, value);
  }
  return out;
}

describe("match broadcast and listing messages", () => {
  it("have the same non-empty keys in zh-Hant, ja, and en", () => {
    const byLocale = LOCALES.map((locale) => {
      const messages = load(locale) as Record<string, Record<string, unknown>>;
      const map = new Map<string, unknown>([
        ...leaves(messages.matchBroadcast, "matchBroadcast"),
        ...leaves(messages.matchListing, "matchListing"),
      ]);
      const orgErrors = (messages.org as { errors: Record<string, unknown> }).errors;
      for (const key of ["invalidVideoUrl", "invalidLiveWindow", "invalidListing"]) {
        map.set(`org.errors.${key}`, orgErrors[key]);
      }
      map.set("matches.durationDefaultHint", messages.matches.durationDefaultHint);
      return { locale, map };
    });
    const [base, ...rest] = byLocale;
    assert.ok(base && base.map.size > 30);
    for (const other of rest) {
      assert.deepEqual([...other.map.keys()].sort(), [...base.map.keys()].sort(), other.locale);
    }
    for (const { locale, map } of byLocale) {
      for (const [key, value] of map) {
        assert.equal(typeof value, "string", `${locale} ${key}`);
        assert.ok((value as string).trim().length > 0, `${locale} ${key} empty`);
      }
      for (const status of ["ok", "blocked", "not_found", "unknown"]) {
        assert.ok(map.has(`matchBroadcast.statuses.${status}`), `${locale} status ${status}`);
      }
    }
  });
});
