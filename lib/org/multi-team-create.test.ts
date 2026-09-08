import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideMultiTeamCreate, parseSelectedTeamIds } from "./multi-team-create.ts";

const TEAM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEAM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("parseSelectedTeamIds", () => {
  it("requires at least one valid team id (TMT-C3)", () => {
    assert.deepEqual(parseSelectedTeamIds([]), { ok: false, errorKey: "missingTeam" });
    assert.deepEqual(parseSelectedTeamIds(["", "  "]), { ok: false, errorKey: "missingTeam" });
    assert.deepEqual(parseSelectedTeamIds(["not-a-uuid"]), { ok: false, errorKey: "missingTeam" });
  });

  it("returns unique lowercase uuids in first-seen order", () => {
    assert.deepEqual(parseSelectedTeamIds([TEAM_A.toUpperCase(), TEAM_B, TEAM_A]), {
      ok: true,
      teamIds: [TEAM_A, TEAM_B],
    });
  });
});

describe("decideMultiTeamCreate", () => {
  it("redirects a single successful match to its detail page", () => {
    const decision = decideMultiTeamCreate({
      results: [{ teamId: TEAM_A, ok: true, errorKey: null, createdId: "sess-1" }],
      preferDetailWhenSingle: true,
    });
    assert.equal(decision.action, "redirect");
    if (decision.action === "redirect") {
      assert.equal(decision.hrefKind, "detail");
      assert.equal(decision.createdId, "sess-1");
    }
  });

  it("redirects multi-team all-success to the list", () => {
    const decision = decideMultiTeamCreate({
      results: [
        { teamId: TEAM_A, ok: true, errorKey: null, createdId: "sess-1" },
        { teamId: TEAM_B, ok: true, errorKey: null, createdId: "sess-2" },
      ],
      preferDetailWhenSingle: true,
    });
    assert.equal(decision.action, "redirect");
    if (decision.action === "redirect") {
      assert.equal(decision.hrefKind, "list");
    }
  });

  it("reports per-team results when one team fails (TMT-C4, keep successes)", () => {
    const decision = decideMultiTeamCreate({
      results: [
        { teamId: TEAM_A, ok: true, errorKey: null, createdId: "sess-1" },
        { teamId: TEAM_B, ok: false, errorKey: "teamNotFound", createdId: null },
      ],
      preferDetailWhenSingle: true,
    });
    assert.equal(decision.action, "report");
    if (decision.action === "report") {
      assert.equal(decision.state.ok, false);
      assert.equal(decision.state.errorKey, "partialTeamCreates");
      assert.equal(decision.state.teamResults?.length, 2);
      assert.equal(decision.state.teamResults?.[0]?.ok, true);
      assert.equal(decision.state.teamResults?.[1]?.errorKey, "teamNotFound");
    }
  });

  it("surfaces the first team error when every team fails", () => {
    const decision = decideMultiTeamCreate({
      results: [
        { teamId: TEAM_A, ok: false, errorKey: "teamNotFound", createdId: null },
        { teamId: TEAM_B, ok: false, errorKey: "generic", createdId: null },
      ],
      preferDetailWhenSingle: false,
    });
    assert.equal(decision.action, "report");
    if (decision.action === "report") {
      assert.equal(decision.state.errorKey, "teamNotFound");
      assert.equal(decision.state.teamResults?.[1]?.errorKey, "generic");
    }
  });
});
