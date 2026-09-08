import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLocaleNotice,
  buildTrilingualNotice,
  publicMatchUrl,
  sessionSignupUrl,
} from "./notice.ts";

const fields = {
  title: "U8 Tuesday",
  timeRange: "Tue 18:00 – 19:30",
  location: "Pitch A",
  team: "U8",
  debitLabel: "1",
  signupUrl: "https://example.test/zh-Hant/app/sessions/abc",
  deadline: "Tue 18:00",
  registeredCount: 7,
};

describe("sessionSignupUrl", () => {
  it("builds a locale session path from the app origin", () => {
    assert.equal(
      sessionSignupUrl("https://app.example", "zh-Hant", "sid-1"),
      "https://app.example/zh-Hant/app/sessions/sid-1",
    );
  });

  it("uses the parent competitions path for cup, league, and friendly", () => {
    assert.equal(
      sessionSignupUrl("https://app.example", "en", "mid-1", "league"),
      "https://app.example/en/app/competitions/mid-1",
    );
    assert.equal(
      sessionSignupUrl("https://app.example", "zh-Hant", "fid-1", "friendly"),
      "https://app.example/zh-Hant/app/competitions/fid-1",
    );
  });

  it("builds a public match path from the app origin", () => {
    assert.equal(
      publicMatchUrl("https://app.example", "zh-Hant", "mid-1"),
      "https://app.example/zh-Hant/matches/mid-1",
    );
  });
});

describe("LINE notice copy", () => {
  it("includes the signup link in every locale (C6)", () => {
    const zh = buildLocaleNotice("zh-Hant", fields);
    const en = buildLocaleNotice("en", fields);
    const ja = buildLocaleNotice("ja", fields);
    assert.match(zh, /報名連結：https:\/\/example\.test\/zh-Hant\/app\/sessions\/abc/);
    assert.match(en, /Signup: https:\/\/example\.test\/zh-Hant\/app\/sessions\/abc/);
    assert.match(ja, /申込リンク：https:\/\/example\.test\/zh-Hant\/app\/sessions\/abc/);
    assert.match(zh, /扣堂：1/);
    assert.match(zh, /目前報名人數：7/);
  });

  it("combined block contains all three locales and the link", () => {
    const block = buildTrilingualNotice(fields);
    assert.match(block, /—— 繁中 ——/);
    assert.match(block, /—— English ——/);
    assert.match(block, /—— 日本語 ——/);
    assert.equal((block.match(/app\/sessions\/abc/g) ?? []).length, 3);
  });
});
