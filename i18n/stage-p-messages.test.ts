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
  "photos.title",
  "photos.missing",
  "photos.missingFilter",
  "photos.showAll",
  "photos.upload",
  "photos.replace",
  "photos.remove",
  "photos.hasPdf",
  "photos.privacyHint",
  "photos.imageHint",
  "photos.pdfHint",
  "photos.viewOnly",
  "org.errors.invalidPhotoType",
  "org.errors.photoTooLarge",
  "org.errors.invalidPdfType",
  "org.errors.pdfTooLarge",
  "org.errors.invalidPhotoPath",
  "org.errors.notApprovedGuardian",
  "org.errors.reportTooManyRows",
  "org.errors.photoPackTooMany",
  "reports.photoPack.title",
  "reports.photoPack.download",
  "reports.photoPack.teamDownload",
  "reports.photoPack.columns.hasPhoto",
  "reports.photoPack.columns.hasPdf",
];

describe("Stage P locale smoke", () => {
  it("has player-photo copy keys in zh-Hant, en, and ja", () => {
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
