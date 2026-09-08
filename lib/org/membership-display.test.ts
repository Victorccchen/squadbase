import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatActiveMembershipSummary,
  sortMemberships,
  splitMemberships,
} from "./membership-display.ts";

function row(input: {
  name: string;
  kind?: string | null;
  jersey: number;
  status?: string;
  updated_at?: string;
}) {
  return {
    status: input.status ?? "active",
    jersey_number: input.jersey,
    updated_at: input.updated_at ?? "2026-09-08T12:00:00.000Z",
    team: { name: input.name, kind: input.kind ?? null },
  };
}

describe("sortMemberships / formatActiveMembershipSummary", () => {
  it("lists 梯隊 before 隊伍 even when the 隊伍 row was updated more recently", () => {
    const memberships = [
      row({
        name: "Futuro U8",
        kind: "competition_team",
        jersey: 99,
        updated_at: "2026-09-08T18:00:00.000Z",
      }),
      row({
        name: "梯隊 U8",
        kind: "age_squad",
        jersey: 91,
        updated_at: "2026-09-01T08:00:00.000Z",
      }),
    ];

    assert.deepEqual(
      sortMemberships(memberships).map((item) => item.team?.name),
      ["梯隊 U8", "Futuro U8"],
    );
    assert.equal(
      formatActiveMembershipSummary(memberships),
      "梯隊 U8 · #91 · Futuro U8 · #99",
    );
  });

  it("sorts 隊伍 by name and puts unknown/legacy kinds last", () => {
    const memberships = [
      row({ name: "U8", kind: "legacy", jersey: 7 }),
      row({ name: "Futuro U9", kind: "competition_team", jersey: 10 }),
      row({ name: "Futuro U8", kind: "competition_team", jersey: 99 }),
      row({ name: "梯隊 U8", kind: "age_squad", jersey: 91 }),
    ];

    assert.deepEqual(
      sortMemberships(memberships).map((item) => item.team?.name),
      ["梯隊 U8", "Futuro U8", "Futuro U9", "U8"],
    );
  });

  it("omits inactive memberships from the summary", () => {
    const memberships = [
      row({ name: "Old U8", kind: "competition_team", jersey: 1, status: "inactive" }),
      row({ name: "梯隊 U8", kind: "age_squad", jersey: 91 }),
      row({ name: "Futuro U8", kind: "competition_team", jersey: 99 }),
    ];

    assert.equal(
      formatActiveMembershipSummary(memberships),
      "梯隊 U8 · #91 · Futuro U8 · #99",
    );
  });
});

describe("splitMemberships", () => {
  it("keeps 梯隊 and 隊伍 independent of input order", () => {
    const memberships = [
      row({ name: "Futuro U8", kind: "competition_team", jersey: 99 }),
      row({ name: "梯隊 U8", kind: "age_squad", jersey: 91 }),
    ];
    const split = splitMemberships(memberships);
    assert.equal(split.ageSquad?.team?.name, "梯隊 U8");
    assert.deepEqual(
      split.competition.map((item) => item.team?.name),
      ["Futuro U8"],
    );
  });
});
