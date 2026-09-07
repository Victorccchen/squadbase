import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extraPublicMatchKeys,
  extraPublicRosterKeys,
  formatMatchScore,
  isPubliclyListedMatch,
  isRecentPastMatch,
  isUpcomingMatch,
  matchRpcErrorKey,
  parseMatchKind,
  parseMatchScore,
  parseMatchSide,
  partitionPublicMatches,
  publicPayloadHasForbiddenKeys,
} from "./match.ts";

describe("parseMatchSide / parseMatchKind", () => {
  it("accepts home and away", () => {
    assert.equal(parseMatchSide("home"), "home");
    assert.equal(parseMatchSide("away"), "away");
    assert.equal(parseMatchSide("neutral"), null);
  });

  it("accepts only cup and league as public match kinds", () => {
    assert.equal(parseMatchKind("cup"), "cup");
    assert.equal(parseMatchKind("league"), "league");
    assert.equal(parseMatchKind("regular"), null);
    assert.equal(parseMatchKind("special"), null);
  });
});

describe("parseMatchScore / formatMatchScore", () => {
  it("accepts 0–99", () => {
    assert.equal(parseMatchScore("0"), 0);
    assert.equal(parseMatchScore("2"), 2);
    assert.equal(parseMatchScore("99"), 99);
  });

  it("rejects out of range", () => {
    assert.equal(parseMatchScore(""), null);
    assert.equal(parseMatchScore("-1"), null);
    assert.equal(parseMatchScore("100"), null);
    assert.equal(parseMatchScore("1.5"), null);
  });

  it("formats completed scores", () => {
    assert.equal(formatMatchScore(2, 1), "2 – 1");
    assert.equal(formatMatchScore(0, 0), "0 – 0");
    assert.equal(formatMatchScore(null, 1), null);
  });
});

describe("isPubliclyListedMatch", () => {
  const base = {
    isPublished: true,
    publicStatus: "scheduled" as const,
    sessionStatus: "active" as const,
    deletedAt: null,
    kind: "cup",
  };

  it("lists a published scheduled cup match", () => {
    assert.equal(isPubliclyListedMatch(base), true);
  });

  it("lists a published completed league match", () => {
    assert.equal(
      isPubliclyListedMatch({ ...base, publicStatus: "completed", kind: "league" }),
      true,
    );
  });

  it("hides unpublished matches (T5B-2)", () => {
    assert.equal(isPubliclyListedMatch({ ...base, isPublished: false }), false);
  });

  it("hides cancelled matches instead of listing them (T5B-5)", () => {
    assert.equal(isPubliclyListedMatch({ ...base, publicStatus: "cancelled" }), false);
  });

  it("hides inactive or soft-deleted sessions", () => {
    assert.equal(isPubliclyListedMatch({ ...base, sessionStatus: "inactive" }), false);
    assert.equal(
      isPubliclyListedMatch({ ...base, deletedAt: "2026-09-07T00:00:00+08:00" }),
      false,
    );
  });

  it("hides regular/special sessions", () => {
    assert.equal(isPubliclyListedMatch({ ...base, kind: "regular" }), false);
  });
});

describe("partitionPublicMatches", () => {
  const now = Date.parse("2026-09-07T12:00:00+08:00");

  it("splits upcoming vs recent past", () => {
    const { upcoming, recentPast } = partitionPublicMatches(
      [
        { id: "past", starts_at: "2026-09-01T10:00:00+08:00" },
        { id: "soon", starts_at: "2026-09-08T10:00:00+08:00" },
        { id: "now", starts_at: "2026-09-07T12:00:00+08:00" },
      ],
      now,
    );
    assert.deepEqual(
      upcoming.map((row) => row.id),
      ["now", "soon"],
    );
    assert.deepEqual(
      recentPast.map((row) => row.id),
      ["past"],
    );
  });

  it("drops matches older than 90 days from recent past", () => {
    assert.equal(isUpcomingMatch("2026-06-01T10:00:00+08:00", now), false);
    assert.equal(isRecentPastMatch("2026-06-01T10:00:00+08:00", now), false);
  });
});

describe("public payload keys", () => {
  it("flags contact/ability/payment fields (T5B-3)", () => {
    assert.equal(publicPayloadHasForbiddenKeys({ title: "Cup", phone: "0912" }), true);
    assert.equal(publicPayloadHasForbiddenKeys({ title: "Cup", birth_date: "2018-01-01" }), true);
    assert.equal(publicPayloadHasForbiddenKeys({ title: "Cup", last5: "12345" }), true);
    assert.equal(publicPayloadHasForbiddenKeys({ title: "Cup", opponent: "Rivals" }), false);
  });

  it("allows only the published match RPC columns", () => {
    assert.deepEqual(
      extraPublicMatchKeys({
        id: "x",
        team_id: "t",
        team_name: "U12",
        title: "Cup",
        kind: "cup",
        is_playoff: false,
        starts_at: "2026-09-08T10:00:00+08:00",
        ends_at: "2026-09-08T11:30:00+08:00",
        location: "Pitch",
        opponent: "Rivals",
        side: "home",
        public_status: "scheduled",
        club_score: null,
        opponent_score: null,
        result_note: null,
      }),
      [],
    );
    assert.deepEqual(extraPublicMatchKeys({ title: "Cup", notes: "staff" }), ["notes"]);
  });

  it("allows only display-name + jersey on roster RPC rows", () => {
    assert.deepEqual(
      extraPublicRosterKeys({
        player_id: "p",
        name_zh: "陳",
        name_en_given: "Ming",
        name_en_family: "Chen",
        name_ja: null,
        jersey_number: 7,
      }),
      [],
    );
    assert.deepEqual(
      extraPublicRosterKeys({
        player_id: "p",
        name_en_given: "Ming",
        name_en_family: "Chen",
        jersey_number: 7,
        birth_date: "2018-01-01",
        phone: "+886",
      }),
      ["birth_date", "phone"],
    );
  });
});

describe("matchRpcErrorKey", () => {
  it("maps RPC messages", () => {
    assert.equal(
      matchRpcErrorKey({ message: "match kind must be cup or league" }),
      "matchKindRequired",
    );
    assert.equal(matchRpcErrorKey({ message: "opponent required" }), "invalidOpponent");
    assert.equal(matchRpcErrorKey({ message: "match is cancelled" }), "matchCancelled");
    assert.equal(
      matchRpcErrorKey({ message: "match roster player is not on this team" }),
      "matchRosterPlayerInvalid",
    );
    assert.equal(matchRpcErrorKey({ message: "not authorized" }), "forbidden");
  });
});
