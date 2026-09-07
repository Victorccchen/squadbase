import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeMatchGroupKey,
  encodeMatchGroupKey,
  filterSessionsByKinds,
  groupMatchSessionsForParent,
  groupTrainingSessionsForParent,
  parentGroupPath,
  parentOccurrencePath,
  parentReturnPath,
  planBulkSeriesCancel,
  planBulkSeriesRegister,
} from "./parent-series.ts";
import type { SessionKind } from "../supabase/database.types.ts";

function session(input: {
  id: string;
  kind: SessionKind;
  title: string;
  team_id?: string;
  series_id?: string | null;
  starts_at?: string;
  ends_at?: string;
  status?: string;
  deleted_at?: string | null;
}) {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    team_id: input.team_id ?? "11111111-1111-4111-8111-111111111111",
    series_id: input.series_id ?? null,
    starts_at: input.starts_at ?? "2026-10-01T10:00:00.000Z",
    ends_at: input.ends_at ?? "2026-10-01T11:30:00.000Z",
    status: input.status ?? "active",
    deleted_at: input.deleted_at ?? null,
  };
}

describe("T6P-1 training list only regular/special", () => {
  it("drops cup, league, and friendly rows from training grouping", () => {
    const grouped = groupTrainingSessionsForParent([
      session({ id: "r1", kind: "regular", title: "Tue training", series_id: "s1" }),
      session({ id: "sp1", kind: "special", title: "Camp", starts_at: "2026-10-02T10:00:00.000Z" }),
      session({ id: "c1", kind: "cup", title: "Cup" }),
      session({ id: "l1", kind: "league", title: "Victory League" }),
      session({ id: "f1", kind: "friendly", title: "Friendly" }),
    ]);
    const ids = grouped.flatMap((group) => group.sessions.map((row) => row.id));
    assert.deepEqual(ids.sort(), ["r1", "sp1"]);
    assert.equal(
      grouped.some((group) =>
        group.sessions.some(
          (row) => row.kind === "cup" || row.kind === "league" || row.kind === "friendly",
        ),
      ),
      false,
    );
  });

  it("groups by series_id and keeps orphan sessions as one-offs", () => {
    const grouped = groupTrainingSessionsForParent([
      session({
        id: "r1",
        kind: "regular",
        title: "Tue training",
        series_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        starts_at: "2026-10-06T10:00:00.000Z",
      }),
      session({
        id: "r2",
        kind: "regular",
        title: "Tue training",
        series_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        starts_at: "2026-10-13T10:00:00.000Z",
      }),
      session({ id: "sp1", kind: "special", title: "Camp", starts_at: "2026-10-02T10:00:00.000Z" }),
    ]);
    assert.equal(grouped.length, 2);
    const series = grouped.find((group) => group.groupKind === "training-series");
    const oneOff = grouped.find((group) => group.groupKind === "training-one-off");
    assert.equal(series?.sessions.length, 2);
    assert.equal(oneOff?.sessions[0]?.id, "sp1");
    assert.equal(parentGroupPath(series!), "/app/sessions/series/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });
});

describe("T6P-2 competition list cup/league/friendly; VL title groups", () => {
  it("drops regular/special and groups Victory League shells by title", () => {
    const teamId = "11111111-1111-4111-8111-111111111111";
    const grouped = groupMatchSessionsForParent([
      session({ id: "r1", kind: "regular", title: "Tue training" }),
      session({
        id: "l1",
        kind: "league",
        title: "Victory League",
        series_id: null,
        starts_at: "2026-10-04T07:00:00.000Z",
      }),
      session({
        id: "l2",
        kind: "league",
        title: "Victory League",
        series_id: null,
        starts_at: "2026-10-11T07:00:00.000Z",
      }),
      session({
        id: "c1",
        kind: "cup",
        title: "Spring Cup",
        starts_at: "2026-09-20T07:00:00.000Z",
      }),
    ]);
    assert.equal(grouped.length, 2);
    const league = grouped.find((group) => group.title === "Victory League");
    const cup = grouped.find((group) => group.title === "Spring Cup");
    assert.equal(league?.sessions.length, 2);
    assert.equal(league?.groupKind, "match-group");
    assert.equal(cup?.sessions.length, 1);
    const decoded = decodeMatchGroupKey(league!.key);
    assert.deepEqual(decoded, { teamId, kind: "league", title: "Victory League" });
    assert.equal(encodeMatchGroupKey(decoded!), league!.key);
    assert.equal(parentGroupPath(league!), `/app/competitions/group/${league!.key}`);
  });

  it("filterSessionsByKinds keeps only requested kinds", () => {
    const rows = [
      session({ id: "1", kind: "regular", title: "A" }),
      session({ id: "2", kind: "cup", title: "B" }),
    ];
    assert.deepEqual(
      filterSessionsByKinds(rows, ["regular", "special"]).map((row) => row.id),
      ["1"],
    );
    assert.deepEqual(
      filterSessionsByKinds(rows, ["cup", "league", "friendly"]).map((row) => row.id),
      ["2"],
    );
  });

  it("groups friendly matches by team, kind, and title (T6P1-2)", () => {
    const teamId = "11111111-1111-4111-8111-111111111111";
    const grouped = groupMatchSessionsForParent([
      session({
        id: "f1",
        kind: "friendly",
        title: "Saturday friendly",
        starts_at: "2026-10-03T07:00:00.000Z",
      }),
      session({
        id: "f2",
        kind: "friendly",
        title: "Saturday friendly",
        starts_at: "2026-10-10T07:00:00.000Z",
      }),
      session({ id: "c1", kind: "cup", title: "Spring Cup", starts_at: "2026-09-20T07:00:00.000Z" }),
    ]);
    const friendly = grouped.find((group) => group.title === "Saturday friendly");
    assert.equal(friendly?.sessions.length, 2);
    assert.equal(friendly?.sessionKind, "friendly");
    assert.deepEqual(decodeMatchGroupKey(friendly!.key), {
      teamId,
      kind: "friendly",
      title: "Saturday friendly",
    });
    assert.equal(parentOccurrencePath({ id: "f1", kind: "friendly" }), "/app/competitions/f1");
  });
});

describe("T6P-4 bulk register partial", () => {
  const now = new Date("2026-09-10T10:00:00.000Z");
  const playerId = "p1";
  const teamId = "11111111-1111-4111-8111-111111111111";

  it("registers eligible rows and skips already-registered, including a 24h-locked one, with reasons", () => {
    const sessions = [
      session({
        id: "open",
        kind: "regular",
        title: "A",
        starts_at: "2026-09-20T10:00:00.000Z",
        ends_at: "2026-09-20T11:30:00.000Z",
      }),
      session({
        id: "soon-registered",
        kind: "regular",
        title: "B",
        starts_at: "2026-09-11T09:00:00.000Z",
        ends_at: "2026-09-11T10:30:00.000Z",
      }),
      session({
        id: "soon-open",
        kind: "regular",
        title: "C",
        starts_at: "2026-09-11T09:30:00.000Z",
        ends_at: "2026-09-11T11:00:00.000Z",
      }),
    ];
    const plan = planBulkSeriesRegister({
      sessions,
      playerId,
      approvedPlayerIds: [playerId],
      playerTeamId: teamId,
      registeredSessionIds: new Set(["soon-registered"]),
      now,
    });
    assert.equal(plan.guardianError, null);
    const byId = Object.fromEntries(plan.rows.map((row) => [row.session.id, row]));
    assert.equal(byId.open?.action, "register");
    assert.equal(byId["soon-open"]?.action, "register");
    assert.equal(byId["soon-registered"]?.action, "skip");
    assert.equal(byId["soon-registered"]?.reason, "alreadyRegistered");
  });
});

describe("T6P-5 bulk cancel cancellable only", () => {
  const now = new Date("2026-09-10T10:00:00.000Z");
  const playerId = "p1";

  it("cancels unlocked registrations and skips the 24h lock with a reason", () => {
    const sessions = [
      session({
        id: "far",
        kind: "league",
        title: "VL",
        starts_at: "2026-09-20T10:00:00.000Z",
      }),
      session({
        id: "locked",
        kind: "league",
        title: "VL",
        starts_at: "2026-09-11T09:00:00.000Z",
      }),
      session({
        id: "not-registered",
        kind: "league",
        title: "VL",
        starts_at: "2026-09-27T10:00:00.000Z",
      }),
    ];
    const plan = planBulkSeriesCancel({
      sessions,
      playerId,
      approvedPlayerIds: [playerId],
      registeredSessionIds: new Set(["far", "locked"]),
      now,
    });
    const byId = Object.fromEntries(plan.rows.map((row) => [row.session.id, row]));
    assert.equal(byId.far?.action, "cancel");
    assert.equal(byId.locked?.action, "skip");
    assert.equal(byId.locked?.reason, "cannotCancelWithin24h");
    assert.equal(byId["not-registered"]?.action, "skip");
    assert.equal(byId["not-registered"]?.reason, "cannotCancelRegistration");
  });
});

describe("T6P-6 non-guardian denied", () => {
  it("does not plan register or cancel for a player the caller does not guardian", () => {
    const sessions = [
      session({ id: "s1", kind: "regular", title: "Tue" }),
    ];
    const registerPlan = planBulkSeriesRegister({
      sessions,
      playerId: "other-child",
      approvedPlayerIds: ["my-child"],
      playerTeamId: "11111111-1111-4111-8111-111111111111",
      registeredSessionIds: new Set(),
    });
    const cancelPlan = planBulkSeriesCancel({
      sessions,
      playerId: "other-child",
      approvedPlayerIds: ["my-child"],
      registeredSessionIds: new Set(["s1"]),
    });
    assert.equal(registerPlan.guardianError, "notApprovedGuardian");
    assert.equal(registerPlan.rows.length, 0);
    assert.equal(cancelPlan.guardianError, "notApprovedGuardian");
    assert.equal(cancelPlan.rows.length, 0);
  });
});

describe("T6P-10 single register/cancel still works", () => {
  it("plans a single open occurrence as register and a single unlocked registration as cancel", () => {
    const now = new Date("2026-09-10T10:00:00.000Z");
    const one = session({
      id: "only",
      kind: "special",
      title: "Camp",
      starts_at: "2026-09-20T10:00:00.000Z",
      ends_at: "2026-09-20T12:00:00.000Z",
    });
    const registerPlan = planBulkSeriesRegister({
      sessions: [one],
      playerId: "p1",
      approvedPlayerIds: ["p1"],
      playerTeamId: one.team_id,
      registeredSessionIds: new Set(),
      now,
    });
    const cancelPlan = planBulkSeriesCancel({
      sessions: [one],
      playerId: "p1",
      approvedPlayerIds: ["p1"],
      registeredSessionIds: new Set(["only"]),
      now,
    });
    assert.equal(registerPlan.rows[0]?.action, "register");
    assert.equal(cancelPlan.rows[0]?.action, "cancel");
    assert.equal(parentOccurrencePath(one), "/app/sessions/only");
    assert.equal(parentOccurrencePath({ id: "m1", kind: "cup" }), "/app/competitions/m1");
  });
});

describe("parentReturnPath", () => {
  it("only accepts a decoded match group key", () => {
    const key = encodeMatchGroupKey({
      teamId: "11111111-1111-4111-8111-111111111111",
      kind: "league",
      title: "Victory League",
    });
    assert.equal(
      parentReturnPath({ returnTo: "competition-group", groupKey: key }),
      `/app/competitions/group/${key}`,
    );
    assert.equal(
      parentReturnPath({ returnTo: "competition-group", groupKey: "../evil" }),
      "/app/competitions",
    );
  });
});
