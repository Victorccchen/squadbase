import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isJerseyUniqueViolation,
  isPlayersCjkNameCheckViolation,
  parseBirthDate,
  parseJersey,
  parsePlayerNames,
  playerNamesError,
} from "./parse.ts";

describe("parseJersey", () => {
  it("accepts 1–99", () => {
    assert.equal(parseJersey("1"), 1);
    assert.equal(parseJersey("99"), 99);
    assert.equal(parseJersey("07"), 7);
  });

  it("rejects out of range or non-integers", () => {
    assert.equal(parseJersey("0"), null);
    assert.equal(parseJersey("100"), null);
    assert.equal(parseJersey("7.5"), null);
    assert.equal(parseJersey(""), null);
  });
});

describe("parseBirthDate", () => {
  it("rejects future dates and invalid calendar days", () => {
    assert.equal(parseBirthDate("2026-08-16", "2026-08-15"), "future");
    assert.equal(parseBirthDate("2020-02-30", "2026-08-15"), null);
  });

  it("accepts today and past dates", () => {
    assert.equal(parseBirthDate("2026-08-15", "2026-08-15"), "2026-08-15");
    assert.equal(parseBirthDate("2014-08-15", "2026-08-15"), "2014-08-15");
  });
});

describe("isJerseyUniqueViolation", () => {
  it("matches PostgREST 23505 payload for team+jersey", () => {
    assert.equal(
      isJerseyUniqueViolation({
        code: "23505",
        message: 'duplicate key value violates unique constraint "team_memberships_team_jersey_key"',
        details: "Key (team_id, jersey_number)=(abc, 7) already exists.",
      }),
      true,
    );
  });

  it("does not treat player+team uniqueness as a jersey clash", () => {
    assert.equal(
      isJerseyUniqueViolation({
        code: "23505",
        message: 'duplicate key value violates unique constraint "team_memberships_player_team_key"',
        details: "Key (player_id, team_id)=(abc, def) already exists.",
      }),
      false,
    );
  });
});

describe("playerNamesError", () => {
  it("requires English given and family names", () => {
    assert.equal(
      playerNamesError({
        nameZh: "陳小明",
        nameEnGiven: "",
        nameEnFamily: "Chen",
        nameJa: null,
      }),
      "invalidName",
    );
    assert.equal(
      playerNamesError({
        nameZh: "陳小明",
        nameEnGiven: "Ming",
        nameEnFamily: "",
        nameJa: null,
      }),
      "invalidName",
    );
  });

  it("requires at least one of Traditional Chinese or Japanese", () => {
    assert.equal(
      playerNamesError({
        nameZh: null,
        nameEnGiven: "Ming",
        nameEnFamily: "Chen",
        nameJa: null,
      }),
      "missingCjkName",
    );
  });

  it("accepts English plus Traditional Chinese only", () => {
    assert.equal(
      playerNamesError({
        nameZh: "陳小明",
        nameEnGiven: "Ming",
        nameEnFamily: "Chen",
        nameJa: null,
      }),
      null,
    );
  });

  it("accepts English plus Japanese only", () => {
    assert.equal(
      playerNamesError({
        nameZh: null,
        nameEnGiven: "Ming",
        nameEnFamily: "Chen",
        nameJa: "チン ショウメイ",
      }),
      null,
    );
  });

  it("treats whitespace-only CJK fields as empty", () => {
    const form = new FormData();
    form.set("name_zh", "   ");
    form.set("name_en_given", " Ming ");
    form.set("name_en_family", " Chen ");
    form.set("name_ja", "");
    const names = parsePlayerNames(form);
    assert.deepEqual(names, {
      nameZh: null,
      nameEnGiven: "Ming",
      nameEnFamily: "Chen",
      nameJa: null,
    });
    assert.equal(playerNamesError(names), "missingCjkName");
  });
});

describe("isPlayersCjkNameCheckViolation", () => {
  it("matches the zh-or-ja CHECK constraint", () => {
    assert.equal(
      isPlayersCjkNameCheckViolation({
        code: "23514",
        message:
          'new row for relation "players" violates check constraint "players_name_zh_or_ja_present"',
      }),
      true,
    );
  });

  it("ignores other check failures", () => {
    assert.equal(
      isPlayersCjkNameCheckViolation({
        code: "23514",
        message:
          'new row for relation "players" violates check constraint "players_name_en_given_not_blank"',
      }),
      false,
    );
  });
});
