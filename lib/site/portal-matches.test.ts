import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { portalAccountHref, portalAccountLabelKey } from "./portal-auth.ts";
import { portalResultMark, selectPortalMatches } from "./portal-matches.ts";

const NOW = Date.parse("2026-10-01T12:00:00+08:00");

describe("selectPortalMatches", () => {
  it("returns empty upcoming and recent lists when there are no matches", () => {
    assert.deepEqual(selectPortalMatches([], NOW), { upcoming: [], recent: [] });
  });

  it("keeps both rows when only two matches exist", () => {
    const rows = [
      { id: "later", starts_at: "2026-10-05T12:00:00+08:00" },
      { id: "past", starts_at: "2026-09-29T12:00:00+08:00" },
    ];
    const selected = selectPortalMatches(rows, NOW);
    assert.deepEqual(
      selected.upcoming.map((row) => row.id),
      ["later"],
    );
    assert.deepEqual(
      selected.recent.map((row) => row.id),
      ["past"],
    );
  });

  it("limits 10 matches to the 3 soonest upcoming and 3 most recent past", () => {
    const rows = [
      { id: "u6", starts_at: "2026-10-07T12:00:00+08:00" },
      { id: "u2", starts_at: "2026-10-03T12:00:00+08:00" },
      { id: "u4", starts_at: "2026-10-05T12:00:00+08:00" },
      { id: "u1", starts_at: "2026-10-02T12:00:00+08:00" },
      { id: "u5", starts_at: "2026-10-06T12:00:00+08:00" },
      { id: "u3", starts_at: "2026-10-04T12:00:00+08:00" },
      { id: "r4", starts_at: "2026-09-27T12:00:00+08:00" },
      { id: "r1", starts_at: "2026-09-30T12:00:00+08:00" },
      { id: "r3", starts_at: "2026-09-28T12:00:00+08:00" },
      { id: "r2", starts_at: "2026-09-29T12:00:00+08:00" },
    ];
    const selected = selectPortalMatches(rows, NOW);
    assert.deepEqual(
      selected.upcoming.map((row) => row.id),
      ["u1", "u2", "u3"],
    );
    assert.deepEqual(
      selected.recent.map((row) => row.id),
      ["r1", "r2", "r3"],
    );
  });

  it("treats kickoff equal to now as upcoming and earlier kickoff as recent", () => {
    const selected = selectPortalMatches(
      [
        { id: "at", starts_at: "2026-10-01T12:00:00+08:00" },
        { id: "before", starts_at: "2026-10-01T11:59:00+08:00" },
        { id: "after", starts_at: "2026-10-01T12:01:00+08:00" },
      ],
      NOW,
    );
    assert.deepEqual(
      selected.upcoming.map((row) => row.id),
      ["at", "after"],
    );
    assert.deepEqual(
      selected.recent.map((row) => row.id),
      ["before"],
    );
  });

  it("drops matches older than the public 90-day window", () => {
    const selected = selectPortalMatches(
      [{ id: "old", starts_at: "2026-06-01T12:00:00+08:00" }],
      NOW,
    );
    assert.deepEqual(selected.recent, []);
    assert.deepEqual(selected.upcoming, []);
  });
});

describe("portalResultMark", () => {
  it("does not invent a result when a score is missing", () => {
    assert.equal(portalResultMark(null, 1), null);
    assert.equal(portalResultMark(1, null), null);
    assert.equal(portalResultMark(2, 1), "W");
    assert.equal(portalResultMark(1, 1), "D");
    assert.equal(portalResultMark(0, 1), "L");
  });
});

describe("portalAccountHref", () => {
  it("sends signed-out visitors to login and signed-in visitors into the app", () => {
    assert.equal(portalAccountHref(false), "/login");
    assert.equal(portalAccountHref(true), "/app");
    assert.equal(portalAccountLabelKey(false), "nav.login");
    assert.equal(portalAccountLabelKey(true), "nav.app");
  });
});
