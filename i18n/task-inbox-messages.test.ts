import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KNOWN_TASK_KINDS, taskKindMessageKey } from "../lib/tasks/model.ts";

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
  "tasks.title",
  "tasks.count",
  "tasks.empty",
  "tasks.done",
  "tasks.snooze",
  "tasks.dismiss",
  "tasks.open",
  "tasks.dueAt",
  "tasks.createdAt",
  "tasks.kinds.other",
  ...KNOWN_TASK_KINDS.map((kind) => `tasks.kinds.${taskKindMessageKey(kind)}`),
];

describe("task inbox messages", () => {
  for (const locale of ["zh-Hant", "en", "ja"] as const) {
    it(`${locale} has every key, including one per known task kind`, () => {
      const messages = loadMessages(locale);
      for (const key of REQUIRED_KEYS) {
        const value = at(messages, key);
        assert.equal(typeof value, "string", `${locale}: ${key}`);
        assert.ok((value as string).trim().length > 0, `${locale}: ${key}`);
      }
    });
  }
});
