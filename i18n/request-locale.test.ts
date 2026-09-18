import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRootParamsRouteContextError,
  localeFromHeaderValue,
  localeFromPathname,
} from "./request-locale.ts";
import { routing } from "./routing.ts";

describe("localeFromPathname", () => {
  it("reads the first segment when it is a configured locale", () => {
    assert.equal(localeFromPathname("/zh-Hant/app/admin/import"), "zh-Hant");
    assert.equal(localeFromPathname("/zh-Hant/app/admin/torneopal"), "zh-Hant");
    assert.equal(localeFromPathname("/en/app/admin/import"), "en");
    assert.equal(localeFromPathname("/ja/app/admin/matches/new"), "ja");
  });

  it("returns null when the path has no locale prefix", () => {
    assert.equal(localeFromPathname("/app/admin/import"), null);
    assert.equal(localeFromPathname("/"), null);
    assert.equal(localeFromPathname(""), null);
  });
});

describe("localeFromHeaderValue", () => {
  it("parses Next-URL and Referer values from the import page", () => {
    assert.equal(
      localeFromHeaderValue("https://squadbase-staging.vercel.app/zh-Hant/app/admin/import"),
      "zh-Hant",
    );
    assert.equal(localeFromHeaderValue("/en/app/admin/import"), "en");
    assert.equal(localeFromHeaderValue("https://example.test/ja/app/admin/import?tab=matches"), "ja");
  });

  it("returns null for missing or unknown prefixes", () => {
    assert.equal(localeFromHeaderValue(null), null);
    assert.equal(localeFromHeaderValue(""), null);
    assert.equal(localeFromHeaderValue("https://example.test/fr/app"), null);
  });
});

describe("isRootParamsRouteContextError", () => {
  it("matches the Next.js 16.3 Server Action root-params error", () => {
    const error = new Error(
      "`import('next/root-params').locale()` was used inside a Server Action. This is not supported. Functions from 'next/root-params' can only be called in the context of a route.",
    );
    assert.equal(isRootParamsRouteContextError(error), true);
    assert.equal(isRootParamsRouteContextError(new Error("generic")), false);
    assert.equal(isRootParamsRouteContextError("string"), false);
  });

  it("keeps the product default locale as Traditional Chinese", () => {
    assert.equal(routing.defaultLocale, "zh-Hant");
  });
});
