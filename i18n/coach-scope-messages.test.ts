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

const REQUIRED_KEYS = [
  ["roster", "viewSession"],
  ["roster", "sessionPlayersTitle"],
  ["roster", "sessionPlayersLeadTraining"],
  ["roster", "sessionPlayersLeadMatch"],
  ["roster", "openAssessment"],
  ["settings", "languageTitle"],
  ["settings", "languageLead"],
  ["settings", "languageLabel"],
  ["settings", "languageSave"],
  ["settings", "languageSaved"],
  ["settings", "languages", "zh-Hant"],
  ["settings", "languages", "ja"],
  ["settings", "languages", "en"],
];

describe("coach scope and language preference messages", () => {
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
