import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareInboxTasks,
  inboxTasks,
  isInInbox,
  nextTaipeiMorning,
  parseTaskDecision,
  taskHref,
  taskKindMessageKey,
} from "./model.ts";

const base = { due_at: null, snoozed_until: null, created_at: "2026-10-01T00:00:00Z" };
const now = new Date("2026-10-02T03:00:00Z");

describe("isInInbox", () => {
  it("shows open tasks and hides closed ones", () => {
    assert.equal(isInInbox({ ...base, status: "open" }, now), true);
    assert.equal(isInInbox({ ...base, status: "done" }, now), false);
    assert.equal(isInInbox({ ...base, status: "dismissed" }, now), false);
  });

  it("shows snoozed tasks only after the snooze ends", () => {
    assert.equal(isInInbox({ ...base, status: "snoozed", snoozed_until: "2026-10-02T02:59:00Z" }, now), true);
    assert.equal(isInInbox({ ...base, status: "snoozed", snoozed_until: "2026-10-02T03:01:00Z" }, now), false);
  });
});

describe("inbox order", () => {
  it("puts due tasks first, earliest due first, then oldest", () => {
    const tasks = [
      { ...base, status: "open" as const, created_at: "2026-10-01T05:00:00Z" },
      { ...base, status: "open" as const, due_at: "2026-10-03T00:00:00Z" },
      { ...base, status: "open" as const, due_at: "2026-10-02T00:00:00Z" },
      { ...base, status: "open" as const, created_at: "2026-10-01T01:00:00Z" },
      { ...base, status: "done" as const, due_at: "2026-10-01T00:00:00Z" },
    ];
    const ordered = inboxTasks(tasks, now);
    assert.deepEqual(
      ordered.map((task) => task.due_at ?? task.created_at),
      ["2026-10-02T00:00:00Z", "2026-10-03T00:00:00Z", "2026-10-01T01:00:00Z", "2026-10-01T05:00:00Z"],
    );
    assert.ok(compareInboxTasks(tasks[2], tasks[1]) < 0);
  });
});

describe("task links and labels", () => {
  it("links known kinds to their admin page", () => {
    const task = (kind: string, entity_id: string | null = null, params: Record<string, unknown> = {}) => ({
      kind,
      entity_id,
      params,
    });
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    assert.equal(taskHref(task("payment_claim.pending")), "/app/admin/claims");
    assert.equal(taskHref(task("guardian_link.pending")), "/app/admin/bindings");
    assert.equal(taskHref(task("credits.renew", id)), `/app/admin/players/${id}`);
    assert.equal(taskHref(task("credits.limit_reached", id)), `/app/admin/players/${id}`);
    assert.equal(
      taskHref(task("leave_request.pending", id, { session_id: id })),
      `/app/admin/sessions/${id}`,
    );
    assert.equal(taskHref(task("leave_request.pending", id, { session_id: "x" })), null);
    assert.equal(taskHref(task("attendance.headcount_mismatch", id)), `/app/admin/sessions/${id}`);
    assert.equal(taskHref(task("attendance.headcount_missing", id)), `/app/admin/sessions/${id}`);
    assert.equal(taskHref(task("invoice.pending", id)), "/app/admin/claims");
    assert.equal(taskHref(task("cash.close_day", id)), "/app/cash");
    assert.equal(taskHref(task("cash.deposit_due", id)), "/app/cash");
    assert.equal(taskHref(task("deposit.reconcile", id)), "/app/admin/deposits");
    assert.equal(taskHref(task("paper_card.mismatch", id)), "/app/admin/paper-cards/checks");
    assert.equal(taskHref(task("something.new")), null);
  });

  it("maps kinds to message keys with a fallback", () => {
    assert.equal(taskKindMessageKey("payment_claim.pending"), "payment_claim_pending");
    assert.equal(taskKindMessageKey("something.new"), "other");
  });
});

describe("nextTaipeiMorning", () => {
  it("returns 08:00 Taipei on the next Taipei calendar day", () => {
    // 2026-10-02 11:00 Taipei → 2026-10-03 08:00 Taipei = 00:00 UTC.
    assert.equal(nextTaipeiMorning(now).toISOString(), "2026-10-03T00:00:00.000Z");
  });

  it("uses the Taipei date, not the UTC date, just before Taipei midnight", () => {
    // 2026-10-01 23:30 Taipei = 15:30 UTC → 2026-10-02 08:00 Taipei.
    assert.equal(nextTaipeiMorning(new Date("2026-10-01T15:30:00Z")).toISOString(), "2026-10-02T00:00:00.000Z");
    // 2026-10-02 00:30 Taipei = 2026-10-01 16:30 UTC → 2026-10-03 08:00 Taipei.
    assert.equal(nextTaipeiMorning(new Date("2026-10-01T16:30:00Z")).toISOString(), "2026-10-03T00:00:00.000Z");
  });
});

describe("parseTaskDecision", () => {
  it("accepts only done, dismissed and snoozed", () => {
    assert.equal(parseTaskDecision("done"), "done");
    assert.equal(parseTaskDecision("snoozed"), "snoozed");
    assert.equal(parseTaskDecision("open"), null);
    assert.equal(parseTaskDecision(""), null);
  });
});
