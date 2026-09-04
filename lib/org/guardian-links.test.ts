import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uniqueApprovedLinksByPlayerId } from "./guardian-links.ts";

function link(overrides: {
  id: string;
  player_id: string;
  status: string;
  created_at: string;
  updated_at?: string;
}) {
  return {
    updated_at: overrides.created_at,
    ...overrides,
  };
}

describe("uniqueApprovedLinksByPlayerId", () => {
  it("keeps a single approved child once when two approved rows share a player", () => {
    const older = link({
      id: "link-old",
      player_id: "player-chen",
      status: "approved",
      created_at: "2026-08-01T00:00:00.000Z",
    });
    const newer = link({
      id: "link-new",
      player_id: "player-chen",
      status: "approved",
      created_at: "2026-09-01T00:00:00.000Z",
    });
    const other = link({
      id: "link-other",
      player_id: "player-lee",
      status: "approved",
      created_at: "2026-09-02T00:00:00.000Z",
    });
    const pending = link({
      id: "link-pending",
      player_id: "player-chen",
      status: "pending",
      created_at: "2026-09-03T00:00:00.000Z",
    });

    const result = uniqueApprovedLinksByPlayerId([newer, other, older, pending]);
    assert.deepEqual(
      result.map((row) => row.id),
      ["link-new", "link-other"],
    );
  });

  it("ignores rejected and revoked history rows", () => {
    const approved = link({
      id: "link-ok",
      player_id: "player-a",
      status: "approved",
      created_at: "2026-09-01T00:00:00.000Z",
    });
    const revoked = link({
      id: "link-revoked",
      player_id: "player-a",
      status: "revoked",
      created_at: "2026-09-02T00:00:00.000Z",
    });
    assert.deepEqual(
      uniqueApprovedLinksByPlayerId([revoked, approved]).map((row) => row.id),
      ["link-ok"],
    );
  });
});
