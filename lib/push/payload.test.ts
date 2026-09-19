import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPushPayload } from "./payload.ts";

const fields = {
  title: "Futuro U8 friendly",
  timeRange: "Sat 09:00 – 10:30",
  location: "Stadium Road 1",
  team: "Futuro U8",
  appUrl: "https://app.example/en/app/competitions/22222222-2222-4222-8222-222222222222",
  publicUrl: "https://app.example/en/matches/22222222-2222-4222-8222-222222222222",
  deadline: "",
  registeredCount: 11,
  opponent: "Rivals",
  score: "2 – 1",
  recap: "Good pressing.",
  kit: "boots",
  gear: "",
  gather: "09:00 gate",
};

describe("push payload locales", () => {
  it("zh-Hant, en, and ja headings differ", () => {
    const zh = buildPushPayload("zh-Hant", "regular_training_signup", fields);
    const en = buildPushPayload("en", "regular_training_signup", fields);
    const ja = buildPushPayload("ja", "regular_training_signup", fields);
    assert.match(zh.title, /例行訓練報名/);
    assert.match(en.title, /Regular training signup/);
    assert.match(ja.title, /通常練習の申込/);
    assert.notEqual(zh.title, en.title);
    assert.equal(zh.url, fields.appUrl);
  });

  it("omits blank optional match-note lines from the short body", () => {
    const payload = buildPushPayload("zh-Hant", "match_notes", {
      ...fields,
      gather: "",
    });
    assert.match(payload.title, /出賽注意/);
    assert.doesNotMatch(payload.body, /09:00 gate/);
    assert.doesNotMatch(payload.body, /Stadium Road 1/);
  });
});
