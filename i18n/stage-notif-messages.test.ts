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
  "nav.settings",
  "settings.title",
  "settings.pushTitle",
  "settings.enable",
  "settings.disable",
  "settings.iosHint",
  "settings.stagingHint",
  "notices.pushTitle",
  "notices.pushSend",
  "notices.pushIntended",
  "notices.pushSubscribed",
  "notices.pushSkipped",
  "notices.pushResult",
  "org.errors.pushNotConfigured",
  "org.errors.pushProductionBlocked",
  "org.errors.pushPermissionDenied",
  "org.errors.pushSubscribeFailed",
  "org.errors.pushUnsupported",
  "app.placeholders.settings.title",
  "app.openSettings",
];

describe("Stage Notif locale smoke", () => {
  it("has push settings and admin 推播 keys in zh-Hant, en, and ja", () => {
    for (const locale of ["zh-Hant", "en", "ja"] as const) {
      const messages = loadMessages(locale);
      for (const key of REQUIRED_KEYS) {
        const value = at(messages, key);
        assert.equal(typeof value, "string", `${locale} missing ${key}`);
        assert.ok(String(value).length > 0, `${locale} empty ${key}`);
      }
    }
  });
});
