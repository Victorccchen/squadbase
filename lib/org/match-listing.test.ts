import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMatchListingForm } from "./match-listing.ts";
import { pickVideoTitle } from "./youtube.ts";

const ID = "5d0b7a52-2c1e-4f8e-9a51-0c1d2e3f4a5b";
const empty = {
  opponentClubId: "",
  publicVenueId: "",
  seasonId: "",
  competitionId: "",
  roundNo: "",
  roundLabel: "",
};

describe("parseMatchListingForm", () => {
  it("allows clearing every field", () => {
    assert.deepEqual(parseMatchListingForm(empty), {
      ok: true,
      opponentClubId: null,
      publicVenueId: null,
      seasonId: null,
      competitionId: null,
      roundNo: null,
      roundLabel: null,
    });
  });

  it("parses ids and round", () => {
    const parsed = parseMatchListingForm({
      ...empty,
      opponentClubId: ID,
      seasonId: ID,
      roundNo: "21",
      roundLabel: " 第21輪 ",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.opponentClubId, ID);
    assert.equal(parsed.roundNo, 21);
    assert.equal(parsed.roundLabel, "第21輪");
  });

  it("rejects bad ids, rounds and long labels", () => {
    for (const bad of [
      { ...empty, opponentClubId: "nope" },
      { ...empty, roundNo: "0" },
      { ...empty, roundNo: "100" },
      { ...empty, roundNo: "1.5" },
      { ...empty, roundLabel: "x".repeat(41) },
    ]) {
      assert.deepEqual(parseMatchListingForm(bad), { ok: false, errorKey: "invalidListing" });
    }
  });
});

describe("pickVideoTitle", () => {
  it("prefers the admin title, then live, replay, highlights", () => {
    const checks = [
      { field: "highlights" as const, videoId: "aaaaaaaaaaa", status: "ok" as const, title: "H" },
      { field: "replay" as const, videoId: "bbbbbbbbbbb", status: "ok" as const, title: "R" },
      { field: "live" as const, videoId: "ccccccccccc", status: "blocked" as const, title: null },
    ];
    assert.equal(pickVideoTitle("Mine", checks), "Mine");
    assert.equal(pickVideoTitle(null, checks), "R");
    assert.equal(pickVideoTitle(null, []), null);
  });
});
