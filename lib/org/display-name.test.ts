import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  displayOptionalName,
  englishPlayerName,
  localizedPlayerName,
  playerNameList,
} from "./display-name.ts";

const zhOnly = {
  name_zh: "陳小明",
  name_en_given: "Ming",
  name_en_family: "Chen",
  name_ja: null,
};

const jaOnly = {
  name_zh: null,
  name_en_given: "Ming",
  name_en_family: "Chen",
  name_ja: "チン ショウメイ",
};

const bothCjk = {
  name_zh: "陳小明",
  name_en_given: "Ming",
  name_en_family: "Chen",
  name_ja: "チン ショウメイ",
};

describe("englishPlayerName", () => {
  it("joins given and family with a space", () => {
    assert.equal(englishPlayerName(zhOnly), "Ming Chen");
  });
});

describe("localizedPlayerName", () => {
  it("prefers the UI locale name when present", () => {
    assert.equal(localizedPlayerName(bothCjk, "zh-Hant"), "陳小明");
    assert.equal(localizedPlayerName(bothCjk, "en"), "Ming Chen");
    assert.equal(localizedPlayerName(bothCjk, "ja"), "チン ショウメイ");
  });

  it("falls back to English given+family when the locale name is empty", () => {
    assert.equal(localizedPlayerName(jaOnly, "zh-Hant"), "Ming Chen");
    assert.equal(localizedPlayerName(zhOnly, "ja"), "Ming Chen");
  });

  it("falls back to the other filled CJK name if English is missing", () => {
    const noEnglish = {
      name_zh: null,
      name_en_given: "",
      name_en_family: "",
      name_ja: "チン ショウメイ",
    };
    assert.equal(localizedPlayerName(noEnglish, "zh-Hant"), "チン ショウメイ");
    assert.equal(localizedPlayerName(noEnglish, "en"), "チン ショウメイ");
  });
});

describe("playerNameList", () => {
  it("omits empty CJK names", () => {
    assert.equal(playerNameList(zhOnly), "陳小明 · Ming Chen");
    assert.equal(playerNameList(jaOnly), "Ming Chen · チン ショウメイ");
  });
});

describe("displayOptionalName", () => {
  it("shows an em dash for empty values", () => {
    assert.equal(displayOptionalName(null), "—");
    assert.equal(displayOptionalName("  "), "—");
    assert.equal(displayOptionalName("陳小明"), "陳小明");
  });
});
