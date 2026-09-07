import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessAdmin,
  canAccessRoster,
  canReviewPayments,
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

describe("payment vs attendance roles (C7)", () => {
  it("only admin can review payment claims", () => {
    assert.equal(canReviewPayments(["admin"]), true);
    assert.equal(canReviewPayments(["coach"]), false);
    assert.equal(canReviewPayments(["parent"]), false);
    assert.equal(canReviewPayments(["parent", "coach"]), false);
  });

  it("coach and admin may take attendance; parent may not", () => {
    assert.equal(canTakeAttendance(["coach"]), true);
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
