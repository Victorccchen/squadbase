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

function at(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    return (value as Record<string, unknown>)[key];
  }, source);
}

const REQUIRED_KEYS = [
  "assessments.traits.A",
  "assessments.traits.B",
  "assessments.traits.C",
  "assessments.traits.D",
  "assessments.phases.attack",
  "assessments.phases.defence",
  "assessments.phases.trans_attack",
  "assessments.phases.trans_defence",
  "assessments.traitsChartTitle",
  "assessments.phasesChartTitle",
  "assessments.chartEmptyTitle",
  "assessments.chartEmptyBody",
  "assessments.sessionLink",
  "assessments.skipScore",
  "assessments.partialHint",
  "org.errors.missingScore",
];

describe("Stage 5C locale smoke (T5C-4)", () => {
  it("has ABCD and phase copy in zh-Hant, en, and ja", () => {
    for (const locale of ["zh-Hant", "en", "ja"] as const) {
      const messages = loadMessages(locale);
      for (const key of REQUIRED_KEYS) {
        const value = at(messages, key);
        assert.equal(typeof value, "string", `${locale} missing ${key}`);
        assert.ok(String(value).length > 0, `${locale} empty ${key}`);
      }
    }
  });

  it("labels A as Adaptability and defence as a phase", () => {
    const zh = loadMessages("zh-Hant");
    const en = loadMessages("en");
    const ja = loadMessages("ja");
    assert.match(String(at(zh, "assessments.traits.A")), /適應/);
    assert.match(String(at(en, "assessments.traits.A")), /Adaptability/i);
    assert.match(String(at(ja, "assessments.traits.A")), /適応/);
    assert.match(String(at(zh, "assessments.phases.defence")), /防守/);
    assert.match(String(at(en, "assessments.phases.defence")), /Defence/i);
    assert.match(String(at(ja, "assessments.phases.defence")), /守備/);
    assert.match(String(at(en, "assessments.traits.D")), /Commitment/i);
  });
});
