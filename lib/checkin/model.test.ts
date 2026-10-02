import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkinUrl,
  childrenAlreadyIn,
  childrenToCheckIn,
  isCheckinToken,
  parseCheckinPreview,
  parseCheckinResults,
  sessionsNeedingChoice,
} from "./model.ts";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

const raw = {
  venue_name: "Field A",
  sessions: [
    { id: S1, title: "Training", kind: "regular", team_name: "梯隊 U8", starts_at: "2026-10-10T09:00:00Z", ends_at: "2026-10-10T10:30:00Z" },
    { id: S2, title: "Clinic", kind: "special", team_name: "梯隊 U8", starts_at: "2026-10-10T09:00:00Z", ends_at: "2026-10-10T10:00:00Z" },
  ],
  children: [
    { player_id: "p1", name_zh: "一", name_ja: null, name_en_given: "A", name_en_family: "B", credits_available: 4, session_ids: [S1], checked_in_session_ids: [S1] },
    { player_id: "p2", name_zh: "二", name_ja: null, name_en_given: "C", name_en_family: "D", credits_available: -1, session_ids: [S1, S2], checked_in_session_ids: [] },
    { player_id: "p3", name_zh: "三", name_ja: null, name_en_given: "E", name_en_family: "F", credits_available: 0, session_ids: [], checked_in_session_ids: [] },
  ],
};

describe("check-in model (PR-07)", () => {
  it("builds the QR link and checks tokens", () => {
    const token = "0123456789abcdef0123456789abcdef";
    assert.equal(isCheckinToken(token), true);
    assert.equal(isCheckinToken("../etc"), false);
    assert.equal(checkinUrl("https://example.test/", token), `https://example.test/zh-Hant/app/checkin/${token}`);
  });

  it("parses the preview and groups children", () => {
    const preview = parseCheckinPreview(raw);
    assert.ok(preview);
    assert.equal(preview.venueName, "Field A");
    assert.equal(preview.sessions.length, 2);
    assert.deepEqual(childrenToCheckIn(preview).map((child) => child.playerId), ["p2"]);
    assert.deepEqual(childrenAlreadyIn(preview).map((child) => child.playerId), ["p1"]);
    assert.deepEqual(sessionsNeedingChoice(preview, ["p2"]).map((s) => s.id), [S1, S2]);
    assert.deepEqual(sessionsNeedingChoice(preview, ["p1"]), []);
  });

  it("returns null for an unknown token and ignores junk rows", () => {
    assert.equal(parseCheckinPreview(null), null);
    assert.deepEqual(parseCheckinPreview({ sessions: [1, null], children: "x" })?.sessions, []);
  });

  it("parses check-in results", () => {
    assert.deepEqual(
      parseCheckinResults([
        { player_id: "p1", result: "already", session_id: S1, credits_debited: 1, credits_available: 4 },
        { player_id: "p2", result: "choose", session_ids: [S1, S2] },
        { player_id: "p3", result: "no_session" },
        { player_id: "p4", result: "weird" },
        "junk",
      ]),
      [
        { playerId: "p1", result: "already", sessionId: S1, creditsDebited: 1, creditsAvailable: 4 },
        { playerId: "p2", result: "choose", sessionIds: [S1, S2] },
        { playerId: "p3", result: "no_session" },
      ],
    );
  });
});
