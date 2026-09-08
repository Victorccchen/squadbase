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
  "nav.opsDashboard",
  "admin.dashboardTitle",
  "admin.dashboardBody",
  "app.placeholders.adminDashboard.title",
  "app.openOpsDashboard",
  "dashboard.title",
  "dashboard.approvedRemittance",
  "dashboard.consumedValue",
  "dashboard.periodRemaining",
  "dashboard.outstandingLiability",
  "dashboard.obligationTitle",
  "dashboard.obligationBody",
  "dashboard.periodRemainingHint",
  "dashboard.outstandingLiabilityHint",
  "dashboard.attendanceOverall",
  "dashboard.perSquadTitle",
  "dashboard.privacyHint",
  "dashboard.reportsLink",
];

describe("Stage D locale smoke", () => {
  it("has ops-dashboard copy keys in zh-Hant, en, and ja", () => {
    for (const locale of ["zh-Hant", "en", "ja"] as const) {
      const messages = loadMessages(locale);
      for (const key of REQUIRED_KEYS) {
        const value = at(messages, key);
        assert.equal(typeof value, "string", `${locale} missing ${key}`);
        assert.ok(String(value).length > 0, `${locale} empty ${key}`);
      }
    }
  });

  it("TD-3 explains period comparison vs current outstanding liability", () => {
    for (const locale of ["zh-Hant", "en", "ja"] as const) {
      const messages = loadMessages(locale);
      const body = String(at(messages, "dashboard.obligationBody"));
      const periodHint = String(at(messages, "dashboard.periodRemainingHint"));
      const liabilityHint = String(at(messages, "dashboard.outstandingLiabilityHint"));
      assert.match(body, /期間|period|期間/i);
      assert.match(periodHint, /期間|period|期間/i);
      assert.match(liabilityHint, /快照|snapshot|スナップショット/i);
      assert.doesNotMatch(body, /phone|電話|電話番号/i);
    }
  });
});
