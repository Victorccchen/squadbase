import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAppLocale, routing } from "./routing.ts";

describe("parseAppLocale", () => {
  it("accepts configured locales", () => {
    for (const locale of routing.locales) {
      assert.equal(parseAppLocale(locale), locale);
    }
  });

  it("falls back to the default locale", () => {
    assert.equal(parseAppLocale(""), routing.defaultLocale);
    assert.equal(parseAppLocale("fr"), routing.defaultLocale);
    assert.equal(parseAppLocale("zh"), routing.defaultLocale);
  });
});
