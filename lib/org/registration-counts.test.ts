import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tallyRegisteredCounts } from "./registration-counts.ts";

describe("tallyRegisteredCounts", () => {
  it("counts only registered rows per session", () => {
    const counts = tallyRegisteredCounts([
      { session_id: "a", status: "registered" },
      { session_id: "a", status: "registered" },
      { session_id: "a", status: "cancelled" },
      { session_id: "b", status: "cancelled" },
      { session_id: "c", status: "registered" },
    ]);
    assert.equal(counts.get("a"), 2);
    assert.equal(counts.get("b"), undefined);
    assert.equal(counts.get("c"), 1);
  });

  it("returns an empty map for no rows", () => {
    assert.equal(tallyRegisteredCounts([]).size, 0);
  });
});
