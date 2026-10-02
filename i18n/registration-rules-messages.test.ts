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
  ["sessions", "statuses", "late_cancelled"],
  ["sessions", "lateCancelConfirm"],
  ["sessions", "lateCancelledNotice"],
  ["credits", "leaveReason"],
  ["credits", "leaveReasonPlaceholder"],
  ["credits", "leaveReasons", "illness"],
  ["credits", "leaveReasons", "injury"],
  ["credits", "leaveReasons", "family"],
  ["credits", "leaveReasons", "school"],
  ["credits", "leaveReasons", "other"],
  ["credits", "owedCredits"],
  ["credits", "owedBalance"],
  ["credits", "creditLimitReached"],
  ["credits", "finalizeAttendance"],
  ["credits", "finalizeHint"],
  ["credits", "finalizeConfirm"],
  ["credits", "finalizedAt"],
  ["org", "errors", "creditLimitReached"],
  ["org", "errors", "leaveReasonRequired"],
  ["org", "errors", "invalidLeaveReason"],
  ["org", "errors", "sessionNotEnded"],
  ["tasks", "kinds", "leave_request_pending"],
  ["tasks", "kinds", "credits_renew"],
  ["tasks", "kinds", "credits_limit_reached"],
];

describe("registration rules messages (PR-06)", () => {
  for (const locale of ["zh-Hant", "en", "ja"] as const) {
    it(`${locale} has every key as a non-empty string`, () => {
      const messages = loadMessages(locale);
      for (const key of REQUIRED_KEYS) {
        const value = at(messages, key);
        assert.equal(typeof value, "string", `${locale}: ${key.join(".")}`);
        assert.ok((value as string).trim().length > 0, `${locale}: ${key.join(".")}`);
      }
    });
    it(`${locale} placeholders`, () => {
      const messages = loadMessages(locale);
      assert.match(at(messages, ["sessions", "lateCancelConfirm"]) as string, /\{count\}/);
      assert.match(at(messages, ["credits", "owedCredits"]) as string, /\{count\}/);
      assert.match(at(messages, ["credits", "creditLimitReached"]) as string, /\{limit\}/);
      assert.match(at(messages, ["credits", "finalizedAt"]) as string, /\{time\}/);
    });
  }
});
