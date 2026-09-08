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
  parseMatchOpponent,
  parseMatchScore,
  parseMatchSide,
  partitionPublicMatches,
  planBulkMatchCreates,
  publicOpponentLabel,
  publicPayloadHasForbiddenKeys,
} from "./match.ts";

describe("parseMatchOpponent / publicOpponentLabel", () => {
  it("treats blank opponent as null on create/update", () => {
    assert.deepEqual(parseMatchOpponent(""), { ok: true, opponent: null });
    assert.deepEqual(parseMatchOpponent("   "), { ok: true, opponent: null });
    assert.deepEqual(parseMatchOpponent("Rivals"), { ok: true, opponent: "Rivals" });
  });

  it("rejects opponent names over 200 characters", () => {
    assert.equal(parseMatchOpponent("x".repeat(201)).ok, false);
  });

  it("shows TBD when the opponent is missing (never a fake club name)", () => {
    assert.equal(publicOpponentLabel(null, "TBD"), "TBD");
    assert.equal(publicOpponentLabel("", "對手未定"), "對手未定");
    assert.equal(publicOpponentLabel("  ", "対戦相手未定"), "対戦相手未定");
    assert.equal(publicOpponentLabel("Rivals", "TBD"), "Rivals");
  });
});

describe("planBulkMatchCreates", () => {
  it("produces N sessions from kickoff locals and default 90 minutes", () => {
    const planned = planBulkMatchCreates({
      kickoffLocals: [
        "2026-10-04T15:00",
        "2026-10-11T15:00",
        "2026-10-18T15:00",
        "",
      ],
    });
    assert.equal(planned.ok, true);
    if (!planned.ok) {
      return;
    }
    assert.equal(planned.rows.length, 3);
    assert.equal(planned.rows[0]?.startsAt, "2026-10-04T15:00:00+08:00");
    assert.equal(planned.rows[0]?.endsAt, "2026-10-04T08:30:00.000Z");
    assert.equal(planned.rows[2]?.startsAt, "2026-10-18T15:00:00+08:00");
  });

  it("requires at least one kickoff and caps bulk size", () => {
    assert.equal(planBulkMatchCreates({ kickoffLocals: ["", "  "] }).ok, false);
    if (planBulkMatchCreates({ kickoffLocals: ["", "  "] }).ok === false) {
      assert.equal(
        planBulkMatchCreates({ kickoffLocals: ["", "  "] }).errorKey,
        "matchKickoffRequired",
      );
    }
    const tooMany = planBulkMatchCreates({
      kickoffLocals: Array.from({ length: 41 }, (_, i) => `2026-10-01T15:${String(i).padStart(2, "0")}`),
    });
    assert.equal(tooMany.ok, false);
    if (!tooMany.ok) {
      assert.equal(tooMany.errorKey, "tooManyMatches");
    }
  });
});

describe("parseMatchSide / parseMatchKind", () => {
  it("accepts home and away", () => {
    assert.equal(parseMatchSide("home"), "home");
    assert.equal(parseMatchSide("away"), "away");
    assert.equal(parseMatchSide("neutral"), null);
  });

  it("accepts cup, league, and friendly as public match kinds", () => {
    assert.equal(parseMatchKind("cup"), "cup");
    assert.equal(parseMatchKind("league"), "league");
    assert.equal(parseMatchKind("friendly"), "friendly");
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

  it("lists a published scheduled friendly match (T6P1-5)", () => {
    assert.equal(isPubliclyListedMatch({ ...base, kind: "friendly" }), true);
  });

  it("hides unpublished friendlies", () => {
    assert.equal(
      isPubliclyListedMatch({ ...base, kind: "friendly", isPublished: false }),
      false,
    );
  });

  it("hides regular/special sessions", () => {
    assert.equal(isPubliclyListedMatch({ ...base, kind: "regular" }), false);
    assert.equal(isPubliclyListedMatch({ ...base, kind: "special" }), false);
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
    assert.equal(publicPayloadHasForbiddenKeys({ title: "Cup", photo_path: "x/headshot.jpg" }), true);
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
        photo_path: "secret/headshot.jpg",
        id_pdf_path: "secret/id.pdf",
      }),
      ["birth_date", "phone", "photo_path", "id_pdf_path"],
    );
  });
});

describe("matchRpcErrorKey", () => {
  it("maps RPC messages", () => {
    assert.equal(
      matchRpcErrorKey({ message: "match kind must be cup or league" }),
      "matchKindRequired",
    );
    assert.equal(
      matchRpcErrorKey({ message: "match kind must be cup, league, or friendly" }),
      "matchKindRequired",
    );
    assert.equal(matchRpcErrorKey({ message: "opponent required" }), "invalidOpponent");
    assert.equal(matchRpcErrorKey({ message: "kickoff required" }), "matchKickoffRequired");
    assert.equal(matchRpcErrorKey({ message: "too many matches" }), "tooManyMatches");
    assert.equal(matchRpcErrorKey({ message: "match is cancelled" }), "matchCancelled");
    assert.equal(
      matchRpcErrorKey({ message: "match roster player is not on this team" }),
      "matchRosterPlayerInvalid",
    );
    assert.equal(matchRpcErrorKey({ message: "not authorized" }), "forbidden");
  });
});
