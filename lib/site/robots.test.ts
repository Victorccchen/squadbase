import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRobots, NO_INDEX_ROBOTS } from "./robots.ts";

describe("robots", () => {
  it("keeps the app area and login out of search, public pages allowed", () => {
    const robots = buildRobots();
    const rules = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    assert.equal(rules?.userAgent, "*");
    assert.equal(rules?.allow, "/");
    const disallow = rules?.disallow as string[];
    assert.ok(disallow.includes("/*/app/"));
    assert.ok(disallow.includes("/*/login"));
    assert.ok(!disallow.some((path) => path.includes("matches")));
    assert.deepEqual(NO_INDEX_ROBOTS, { index: false, follow: false });
  });
});
