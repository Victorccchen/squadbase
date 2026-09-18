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
  "nav.import",
  "admin.importTitle",
  "admin.importBody",
  "app.placeholders.adminImport.title",
  "app.placeholders.adminImport.body",
  "torneopal.lead",
  "torneopal.urlLabel",
  "torneopal.urlPlaceholder",
  "torneopal.preview",
  "torneopal.previewing",
  "torneopal.confirm",
  "torneopal.confirming",
  "torneopal.confirmHint",
  "torneopal.previewCounts",
  "torneopal.confirmCounts",
  "torneopal.unpublishedHint",
  "torneopal.statusCreate",
  "torneopal.statusSkip",
  "torneopal.statusError",
  "torneopal.errors.blockedUrl",
  "torneopal.errors.torneopalNoFixtures",
  "torneopal.errors.torneopalNoClubMatches",
  "torneopal.errors.duplicateMatch",
  "torneopal.errors.unmappedTeam",
  "org.errors.torneopalNoFixtures",
  "org.errors.torneopalNoClubMatches",
  "org.errors.duplicateMatch",
  "org.errors.unmappedTeam",
];

const REMOVED_KEYS = [
  "nav.torneopal",
  "admin.torneopalTitle",
  "admin.torneopalBody",
  "app.placeholders.adminTorneopal.title",
  "app.placeholders.adminTorneopal.body",
  "import.tabs.players",
  "import.tabs.coaches",
  "import.tabs.matches",
  "import.tabs.url",
  "import.downloadCsv",
  "import.downloadXlsx",
  "import.fileLabel",
];

describe("Stage L2 locale smoke", () => {
  it("has Torneopal match-URL import copy in zh-Hant, en, and ja", () => {
    for (const locale of ["zh-Hant", "en", "ja"] as const) {
      const messages = loadMessages(locale);
      for (const key of REQUIRED_KEYS) {
        const value = at(messages, key);
        assert.equal(typeof value, "string", `${locale} missing ${key}`);
        assert.ok(String(value).length > 0, `${locale} empty ${key}`);
      }
      for (const key of REMOVED_KEYS) {
        assert.equal(at(messages, key), undefined, `${locale} still has retired ${key}`);
      }
    }
  });

  it("zh-Hant import page describes unpublished league shells", () => {
    const zh = loadMessages("zh-Hant");
    assert.match(String(at(zh, "admin.importTitle")), /Torneopal/);
    assert.match(String(at(zh, "admin.importBody")), /未公開/);
    assert.match(String(at(zh, "torneopal.unpublishedHint")), /未公開|不公開/);
    assert.match(String(at(zh, "torneopal.confirmHint")), /確認/);
    assert.doesNotMatch(String(at(zh, "admin.importBody")), /CSV|Excel/);
  });
});
