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
  isSoftDeleted,
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
