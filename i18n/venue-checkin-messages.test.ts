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
const VENUE_KEYS = Object.keys(at(zh, ["venues"]) as Record<string, unknown>).map((key) => ["venues", key]);
const CHECKIN_KEYS = Object.entries(at(zh, ["checkin"]) as Record<string, unknown>).flatMap(([key, value]) =>
  value && typeof value === "object"
    ? Object.keys(value as Record<string, unknown>).map((sub) => ["checkin", key, sub])
    : [["checkin", key]],
);

const REQUIRED_KEYS = [
  ...VENUE_KEYS,
  ...CHECKIN_KEYS,
  ["nav", "venues"],
  ["sessions", "venue"],
  ["sessions", "venueNone"],
  ["credits", "noticesTitle"],
  ["credits", "noticesUnread"],
  ["credits", "noticeNew"],
  ["credits", "noticesMarkRead"],
  ["credits", "backfillNotice"],
  ["org", "errors", "checkinTokenInvalid"],
  ["org", "errors", "checkinNoChild"],
  ["org", "errors", "headcountInvalid"],
  ["org", "errors", "venueNameRequired"],
  ["org", "errors", "attendanceNotFound"],
  ["tasks", "kinds", "attendance_headcount_mismatch"],
  ["tasks", "kinds", "attendance_headcount_missing"],
];

describe("venue check-in messages (PR-07)", () => {
  it("covers the zh-Hant namespaces", () => {
    assert.ok(VENUE_KEYS.length >= 15);
    assert.ok(CHECKIN_KEYS.length >= 25);
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
    it(`${locale} backfill notice has every placeholder (P07-8)`, () => {
      const text = at(loadMessages(locale), ["credits", "backfillNotice"]) as string;
      for (const placeholder of ["{child}", "{date}", "{debited}", "{remaining}"]) {
        assert.ok(text.includes(placeholder), `${locale}: ${placeholder}`);
      }
    });
  }
});
