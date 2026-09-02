import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isJerseyUniqueViolation,
  parseBirthDate,
  parseJersey,
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
