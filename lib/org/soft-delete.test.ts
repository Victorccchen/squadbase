import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPubliclyListedMatch } from "./match.ts";
import {
  groupMatchSessionsForParent,
  groupTrainingSessionsForParent,
} from "./parent-series.ts";
import { isSessionOpenForSignup } from "./session-time.ts";
import {
  canSoftDeleteOrgRecords,
  filterDefaultAdminList,
  filterParentDefaultList,
  isFuturoCompetitionTeamName,
  isSoftDeleted,
  isVictoryLeagueShellTitle,
  matchesVictoryLeagueBulkSoftDelete,
  planSoftDeleteMatch,
} from "./soft-delete.ts";
import type { SessionKind } from "../supabase/database.types.ts";

function row(id: string, deleted_at: string | null = null) {
  return { id, deleted_at };
}

function session(input: {
  id: string;
  kind: SessionKind;
  title: string;
  deleted_at?: string | null;
}) {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    team_id: "11111111-1111-4111-8111-111111111111",
    series_id: null,
    starts_at: "2026-10-01T10:00:00.000Z",
    deleted_at: input.deleted_at ?? null,
  };
}

describe("soft-delete visibility filters", () => {
  it("hides deleted rows from default admin lists and keeps them when includeDeleted", () => {
    const rows = [row("live"), row("gone", "2026-09-08T00:00:00.000Z")];
    assert.equal(isSoftDeleted(rows[0]!), false);
    assert.equal(isSoftDeleted(rows[1]!), true);
    assert.deepEqual(
      filterDefaultAdminList(rows).map((item) => item.id),
      ["live"],
    );
    assert.deepEqual(
      filterDefaultAdminList(rows, true).map((item) => item.id),
      ["live", "gone"],
    );
  });

  it("hides deleted training and matches from parent default lists before grouping", () => {
    const training = [
      session({ id: "t-live", kind: "regular", title: "Tue" }),
      session({
        id: "t-gone",
        kind: "special",
        title: "Camp",
        deleted_at: "2026-09-08T00:00:00.000Z",
      }),
    ];
    const matches = [
      session({ id: "m-live", kind: "cup", title: "Spring Cup" }),
      session({
        id: "m-gone",
        kind: "league",
        title: "Victory League",
        deleted_at: "2026-09-08T00:00:00.000Z",
      }),
      session({
        id: "m-cancelled-deleted",
        kind: "friendly",
        title: "Friendly",
        deleted_at: "2026-09-08T00:00:00.000Z",
      }),
    ];

    const visibleTraining = filterParentDefaultList(training);
    const visibleMatches = filterParentDefaultList(matches);
    assert.deepEqual(
      groupTrainingSessionsForParent(visibleTraining).flatMap((group) =>
        group.sessions.map((item) => item.id),
      ),
      ["t-live"],
    );
    assert.deepEqual(
      groupMatchSessionsForParent(visibleMatches).flatMap((group) =>
        group.sessions.map((item) => item.id),
      ),
      ["m-live"],
    );
  });

  it("blocks parent signup and public listing once deleted, even if previously cancelled", () => {
    const now = new Date("2026-09-10T10:00:00.000Z");
    assert.equal(
      isSessionOpenForSignup(
        {
          status: "active",
          ends_at: "2026-09-10T12:00:00.000Z",
          deleted_at: "2026-09-08T00:00:00.000Z",
        },
        now,
      ),
      false,
    );
    assert.equal(
      isPubliclyListedMatch({
        isPublished: true,
        publicStatus: "cancelled",
        sessionStatus: "active",
        deletedAt: "2026-09-08T00:00:00.000Z",
        kind: "cup",
      }),
      false,
    );
    assert.equal(
      isPubliclyListedMatch({
        isPublished: true,
        publicStatus: "scheduled",
        sessionStatus: "active",
        deletedAt: "2026-09-08T00:00:00.000Z",
        kind: "friendly",
      }),
      false,
    );
  });
});

describe("soft-delete auth", () => {
  it("is admin-only, matching existing session soft-delete and match cancel", () => {
    assert.equal(canSoftDeleteOrgRecords(["parent"]), false);
    assert.equal(canSoftDeleteOrgRecords(["coach"]), false);
    assert.equal(canSoftDeleteOrgRecords(["parent", "coach"]), false);
    assert.equal(canSoftDeleteOrgRecords([]), false);
    assert.equal(canSoftDeleteOrgRecords(["admin"]), true);
    assert.equal(canSoftDeleteOrgRecords(["parent", "admin"]), true);
  });
});

describe("planSoftDeleteMatch", () => {
  const sessionId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  it("rejects missing env, non-admin roles, and invalid ids before any RPC", () => {
    assert.deepEqual(
      planSoftDeleteMatch({
        configured: false,
        roles: ["admin"],
        sessionId,
        next: "detail",
      }),
      { ok: false, errorKey: "notConfigured" },
    );
    assert.deepEqual(
      planSoftDeleteMatch({
        configured: true,
        roles: ["parent"],
        sessionId,
        next: "detail",
      }),
      { ok: false, errorKey: "forbidden" },
    );
    assert.deepEqual(
      planSoftDeleteMatch({
        configured: true,
        roles: ["coach"],
        sessionId,
        next: "list",
      }),
      { ok: false, errorKey: "forbidden" },
    );
    assert.deepEqual(
      planSoftDeleteMatch({
        configured: true,
        roles: ["admin"],
        sessionId: "not-a-uuid",
        next: "detail",
      }),
      { ok: false, errorKey: "sessionNotFound" },
    );
  });

  it("plans a list redirect after a successful one-match delete", () => {
    const planned = planSoftDeleteMatch({
      configured: true,
      roles: ["parent", "admin"],
      sessionId,
      next: "list",
    });
    assert.deepEqual(planned, {
      ok: true,
      sessionId,
      redirectTo: "list",
      href: "/app/admin/matches",
    });
  });

  it("plans a detail redirect so the deleted banner can render", () => {
    const planned = planSoftDeleteMatch({
      configured: true,
      roles: ["admin"],
      sessionId: sessionId.toUpperCase(),
      next: "detail",
    });
    assert.equal(planned.ok, true);
    if (!planned.ok) {
      return;
    }
    assert.equal(planned.sessionId, sessionId);
    assert.equal(planned.redirectTo, "detail");
    assert.equal(planned.href, `/app/admin/matches/${sessionId}`);
  });
});

describe("Victory League staging bulk filter", () => {
  it("matches VL / 2026/27 暫定 titles and Futuro 隊伍 names", () => {
    assert.equal(isVictoryLeagueShellTitle("Victory League"), true);
    assert.equal(isVictoryLeagueShellTitle("Victory League 2026/27"), true);
    assert.equal(isVictoryLeagueShellTitle("Victory League 2026/27 (暫定)"), true);
    assert.equal(isVictoryLeagueShellTitle("Victory League 2026/27（暫定）"), true);
    assert.equal(isVictoryLeagueShellTitle("  victory   league  "), true);
    assert.equal(isVictoryLeagueShellTitle("Friendly vs Rivals"), false);
    assert.equal(isVictoryLeagueShellTitle("League cup"), false);
    assert.equal(isFuturoCompetitionTeamName("Futuro U8"), true);
    assert.equal(isFuturoCompetitionTeamName("FUTURO U10"), true);
    assert.equal(isFuturoCompetitionTeamName("Some other team"), false);
  });

  it("selects live Futuro VL matches only (idempotent skip of deleted / training)", () => {
    const base = {
      title: "Victory League 2026/27 (暫定)",
      kind: "league",
      teamName: "Futuro U8",
      teamKind: "competition_team" as const,
      deletedAt: null as string | null,
    };
    assert.equal(matchesVictoryLeagueBulkSoftDelete(base), true);
    assert.equal(
      matchesVictoryLeagueBulkSoftDelete({ ...base, deletedAt: "2026-09-21T00:00:00.000Z" }),
      false,
    );
    assert.equal(matchesVictoryLeagueBulkSoftDelete({ ...base, kind: "regular" }), false);
    assert.equal(matchesVictoryLeagueBulkSoftDelete({ ...base, teamName: "Rivals U8" }), false);
    assert.equal(
      matchesVictoryLeagueBulkSoftDelete({ ...base, teamKind: "age_squad" }),
      false,
    );
  });
});
