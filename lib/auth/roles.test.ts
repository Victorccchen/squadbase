import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessAdmin,
  canAccessRoster,
  canTakeAttendance,
  canWriteAssessments,
} from "./roles.ts";

describe("canAccessAdmin", () => {
  it("is false for parent-only, coach-only, player-only, and empty roles", () => {
    assert.equal(canAccessAdmin(["parent"]), false);
    assert.equal(canAccessAdmin(["coach"]), false);
    assert.equal(canAccessAdmin(["player"]), false);
    assert.equal(canAccessAdmin(["parent", "coach"]), false);
    assert.equal(canAccessAdmin([]), false);
  });

  it("is true when admin is present", () => {
    assert.equal(canAccessAdmin(["admin"]), true);
    assert.equal(canAccessAdmin(["parent", "admin"]), true);
  });
});

describe("canAccessRoster", () => {
  it("allows coach and admin, not parent-only", () => {
    assert.equal(canAccessRoster(["coach"]), true);
    assert.equal(canAccessRoster(["admin"]), true);
    assert.equal(canAccessRoster(["parent"]), false);
    assert.equal(canAccessRoster([]), false);
  });
});

describe("attendance roles (Phase 1 PR-04)", () => {
  it("only admin (staff) may take attendance; coaches and parents may not", () => {
    assert.equal(canTakeAttendance(["coach"]), false);
    assert.equal(canTakeAttendance(["admin"]), true);
    assert.equal(canTakeAttendance(["parent"]), false);
  });
});

describe("canWriteAssessments", () => {
  it("allows coach and admin writes; parents are read-only in the app", () => {
    assert.equal(canWriteAssessments(["admin"]), true);
    assert.equal(canWriteAssessments(["coach"]), true);
    assert.equal(canWriteAssessments(["parent"]), false);
    assert.equal(canWriteAssessments(["parent", "coach"]), true);
    assert.equal(canWriteAssessments([]), false);
  });
});
