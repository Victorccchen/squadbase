import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isJerseyUniqueViolation,
  isLinkNotApprovedViolation,
  isOpenGuardianLinkViolation,
  isPlayersCjkNameCheckViolation,
  canAdminRevokeLink,
  canParentCancelLink,
  parseBirthDate,
  parseGuardianRelation,
  parseGuardianSearch,
  parseJersey,
  parseLinkDecision,
  parsePlayerNames,
  playerNamesError,
  teamDeleteErrorKey,
  teamHasNoDeleteBlockers,
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

describe("parseGuardianSearch", () => {
  function form(entries: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) {
      data.set(key, value);
    }
    return data;
  }

  it("requires team+jersey or birth date+name fragment", () => {
    const result = parseGuardianSearch(form({}), "2026-09-02");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorKey, "incompleteSearch");
    }
  });

  it("accepts exact team and jersey (T3 constrained search)", () => {
    const result = parseGuardianSearch(
      form({
        team_id: "11111111-1111-4111-8111-111111111111",
        jersey_number: "12",
      }),
      "2026-09-02",
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fields.jerseyMode, true);
      assert.equal(result.fields.identityMode, false);
      assert.equal(result.fields.jersey, 12);
    }
  });

  it("accepts birth date and a name fragment of at least 2 characters", () => {
    const result = parseGuardianSearch(
      form({
        birth_date: "2014-08-15",
        name_fragment: "Chen",
      }),
      "2026-09-02",
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fields.identityMode, true);
      assert.equal(result.fields.jerseyMode, false);
      assert.equal(result.fields.nameFragment, "Chen");
    }
  });

  it("rejects a one-character name fragment when identity is the only mode", () => {
    const result = parseGuardianSearch(
      form({
        birth_date: "2014-08-15",
        name_fragment: "C",
      }),
      "2026-09-02",
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorKey, "searchNameTooShort");
    }
  });

  it("ANDs both modes when both are complete", () => {
    const result = parseGuardianSearch(
      form({
        team_id: "11111111-1111-4111-8111-111111111111",
        jersey_number: "7",
        birth_date: "2014-08-15",
        name_fragment: "Ming",
      }),
      "2026-09-02",
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fields.jerseyMode, true);
      assert.equal(result.fields.identityMode, true);
    }
  });
});

describe("parseGuardianRelation", () => {
  it("accepts parent, guardian, other", () => {
    assert.equal(parseGuardianRelation("parent"), "parent");
    assert.equal(parseGuardianRelation("guardian"), "guardian");
    assert.equal(parseGuardianRelation("other"), "other");
    assert.equal(parseGuardianRelation("coach"), null);
  });
});

describe("parseLinkDecision", () => {
  it("only allows approve or reject", () => {
    assert.equal(parseLinkDecision("approved"), "approved");
    assert.equal(parseLinkDecision("rejected"), "rejected");
    assert.equal(parseLinkDecision("pending"), null);
    assert.equal(parseLinkDecision("revoked"), null);
  });
});

describe("canParentCancelLink / canAdminRevokeLink", () => {
  it("parent may cancel pending only; admin may revoke approved only", () => {
    assert.equal(canParentCancelLink("pending"), true);
    assert.equal(canParentCancelLink("approved"), false);
    assert.equal(canParentCancelLink("rejected"), false);
    assert.equal(canParentCancelLink("revoked"), false);
    assert.equal(canAdminRevokeLink("approved"), true);
    assert.equal(canAdminRevokeLink("pending"), false);
    assert.equal(canAdminRevokeLink("revoked"), false);
  });
});

describe("teamHasNoDeleteBlockers", () => {
  it("requires zero memberships and zero coach assignments", () => {
    assert.equal(teamHasNoDeleteBlockers(0, 0), true);
    assert.equal(teamHasNoDeleteBlockers(1, 0), false);
    assert.equal(teamHasNoDeleteBlockers(0, 1), false);
  });
});

describe("teamDeleteErrorKey", () => {
  it("maps active memberships before the generic memberships message", () => {
    assert.equal(
      teamDeleteErrorKey({
        message:
          "team has active memberships; end or inactivate memberships first, or deactivate the team instead",
      }),
      "teamHasActiveMemberships",
    );
    assert.equal(
      teamDeleteErrorKey({
        message:
          "team has memberships; remove remaining membership rows before deleting, or deactivate the team instead",
      }),
      "teamHasMemberships",
    );
    assert.equal(
      teamDeleteErrorKey({
        message: "team has coach assignments; unassign coaches first, or deactivate the team instead",
      }),
      "teamHasCoachAssignments",
    );
  });
});

describe("isOpenGuardianLinkViolation", () => {
  it("matches the open-pair unique index", () => {
    assert.equal(
      isOpenGuardianLinkViolation({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "guardian_player_links_open_pair_idx"',
        details: "Key (guardian_user_id, player_id)=(abc, def) already exists.",
      }),
      true,
    );
  });
});

describe("isLinkNotApprovedViolation", () => {
  it("matches the admin revoke RPC miss", () => {
    assert.equal(
      isLinkNotApprovedViolation({
        message: "link not found or not approved",
      }),
      true,
    );
    assert.equal(
      isLinkNotApprovedViolation({
        message: "link not found or not pending",
      }),
      false,
    );
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
