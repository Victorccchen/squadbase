import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSiteRevalidateRequest,
  isAllowedSiteTag,
  matchRevalidateTags,
  normalizeSiteTags,
  SITE_REVALIDATE_MAX_TAGS,
} from "./revalidate.ts";

const MATCH = "5d0b7a52-2c1e-4f8e-9a51-0c1d2e3f4a5b";
const OTHER = "7e1c8b63-3d2f-4a9f-8b62-1d2e3f4a5b6c";

describe("site revalidate tags", () => {
  it("allows only the tags the site accepts", () => {
    for (const tag of [
      "matches",
      `match:${MATCH}`,
      "squad",
      `player:${MATCH}`,
      "news",
      "news:typhoon-postponed",
      "standings",
      "partners",
      "clubs",
      "venues",
    ]) {
      assert.equal(isAllowedSiteTag(tag), true, tag);
    }
    for (const tag of [
      "",
      "match",
      "match:",
      "match:not-a-uuid",
      `match:${MATCH}:x`,
      "news:Bad Slug",
      "seasons",
      "MATCHES",
      `team:${MATCH}`,
    ]) {
      assert.equal(isAllowedSiteTag(tag), false, tag);
    }
  });

  it("builds match tags, with squad for roster changes", () => {
    assert.deepEqual(matchRevalidateTags([MATCH]), ["matches", `match:${MATCH}`]);
    assert.deepEqual(matchRevalidateTags([MATCH], { roster: true }), [
      "matches",
      `match:${MATCH}`,
      "squad",
    ]);
    assert.deepEqual(matchRevalidateTags([MATCH, OTHER, MATCH.toUpperCase()]), [
      "matches",
      `match:${MATCH}`,
      `match:${OTHER}`,
    ]);
    assert.deepEqual(matchRevalidateTags([]), ["matches"]);
  });

  it("drops invalid tags and caps at 20", () => {
    const ids = Array.from({ length: 30 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const tags = normalizeSiteTags(["matches", "bogus", ...ids.map((id) => `match:${id}`)]);
    assert.equal(tags.length, SITE_REVALIDATE_MAX_TAGS);
    assert.equal(tags[0], "matches");
    assert.equal(tags.includes("bogus"), false);
  });
});

describe("buildSiteRevalidateRequest", () => {
  it("skips when either env var is missing", () => {
    const tags = ["matches"];
    assert.equal(buildSiteRevalidateRequest({ url: undefined, secret: "s", tags }), null);
    assert.equal(buildSiteRevalidateRequest({ url: "https://x.test/api/revalidate", secret: "", tags }), null);
    assert.equal(buildSiteRevalidateRequest({ url: "  ", secret: "s", tags }), null);
    assert.equal(buildSiteRevalidateRequest({ url: "not a url", secret: "s", tags }), null);
    assert.equal(buildSiteRevalidateRequest({ url: "ftp://x.test/", secret: "s", tags }), null);
  });

  it("skips when no allowed tag remains", () => {
    assert.equal(
      buildSiteRevalidateRequest({ url: "https://x.test/api/revalidate", secret: "s", tags: ["bogus"] }),
      null,
    );
  });

  it("builds the POST with bearer secret and JSON tags", () => {
    const request = buildSiteRevalidateRequest({
      url: "https://site.test/api/revalidate",
      secret: " sekret ",
      tags: matchRevalidateTags([MATCH], { roster: true }),
    });
    assert.deepEqual(request, {
      url: "https://site.test/api/revalidate",
      init: {
        method: "POST",
        headers: {
          authorization: "Bearer sekret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ tags: ["matches", `match:${MATCH}`, "squad"] }),
      },
    });
  });
});
