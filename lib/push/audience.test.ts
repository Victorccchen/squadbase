import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOTICE_TEMPLATE_KEYS } from "../credits/notice-templates.ts";
import {
  canSendNoticePush,
  coachOnlyProfileIds,
  resolveApprovedGuardianUserIds,
  resolveAudiencePlayerIds,
  resolveNoticePushRecipients,
  summarizePushAudience,
} from "./audience.ts";
import { isGonePushStatus, shouldRetryPushAttempt, summarizePushDelivery } from "./delivery.ts";
import { canSendPushInAppEnv } from "./env.ts";
import { buildPushPayload, pushPayloadLooksLikeParentPii } from "./payload.ts";

const squadId = "squad-u8";
const teamId = "team-u9";
const sessionPlayerA = "player-a";
const sessionPlayerB = "player-b";
const parentOne = "parent-1";
const parentTwo = "parent-2";
const parentBoth = "parent-both";
const coachOnly = "coach-1";

const memberships = [
  { playerId: sessionPlayerA, teamId: squadId, status: "active" as const },
  { playerId: sessionPlayerB, teamId: squadId, status: "active" as const },
  { playerId: "inactive-child", teamId: squadId, status: "inactive" as const },
  { playerId: sessionPlayerA, teamId, status: "active" as const },
];

const links = [
  { guardianUserId: parentOne, playerId: sessionPlayerA, status: "approved" as const },
  { guardianUserId: parentBoth, playerId: sessionPlayerA, status: "approved" as const },
  { guardianUserId: parentTwo, playerId: sessionPlayerB, status: "approved" as const },
  { guardianUserId: parentBoth, playerId: sessionPlayerB, status: "approved" as const },
  { guardianUserId: "pending-parent", playerId: sessionPlayerA, status: "pending" as const },
  { guardianUserId: "revoked-parent", playerId: sessionPlayerB, status: "revoked" as const },
];

const registrations = [
  { playerId: sessionPlayerA, status: "registered" as const },
  { playerId: sessionPlayerB, status: "cancelled" as const },
];

const fields = {
  title: "U8 Tuesday",
  timeRange: "Tue 18:00 – 19:30",
  location: "Pitch A, 123 Example Road",
  team: "梯隊 U8",
  appUrl: "https://app.example/zh-Hant/app/sessions/11111111-1111-4111-8111-111111111111",
  publicUrl: "",
  deadline: "Tue 18:00",
  registeredCount: 7,
  opponent: "Rivals",
  score: "2 – 1",
  recap: "Good pressing.",
  kit: "boots",
  gear: "water",
  gather: "17:30 gate",
};

describe("TN-P1 audience → approved guardians", () => {
  it("age_squad uses active memberships only", () => {
    const players = resolveAudiencePlayerIds({
      audience: "age_squad",
      teamId: squadId,
      memberships,
      registrations,
    });
    assert.deepEqual(players.sort(), [sessionPlayerA, sessionPlayerB].sort());
    assert.equal(players.includes("inactive-child"), false);
  });

  it("competition_team uses that 隊伍 roster", () => {
    const players = resolveAudiencePlayerIds({
      audience: "competition_team",
      teamId,
      memberships,
      registrations,
    });
    assert.deepEqual(players, [sessionPlayerA]);
  });

  it("session_registrations uses registered rows only", () => {
    const players = resolveAudiencePlayerIds({
      audience: "session_registrations",
      teamId: null,
      memberships,
      registrations,
    });
    assert.deepEqual(players, [sessionPlayerA]);
  });

  it("drops pending and revoked links", () => {
    const userIds = resolveApprovedGuardianUserIds([sessionPlayerA], links);
    assert.deepEqual(userIds.sort(), [parentBoth, parentOne].sort());
    assert.equal(userIds.includes("pending-parent"), false);
  });
});

describe("TN-P2 dedupe one user for multiple children", () => {
  it("returns each guardian once when two children match", () => {
    const userIds = resolveNoticePushRecipients({
      audience: "age_squad",
      teamId: squadId,
      memberships,
      registrations,
      links,
    });
    assert.deepEqual(userIds.sort(), [parentBoth, parentOne, parentTwo].sort());
    assert.equal(userIds.filter((id) => id === parentBoth).length, 1);
  });
});

describe("TN-P3 / TN-P4 preview counts skip unsubscribed", () => {
  it("counts intended, subscribed, and skipped without sending", () => {
    const intended = resolveNoticePushRecipients({
      audience: "age_squad",
      teamId: squadId,
      memberships,
      registrations,
      links,
    });
    const summary = summarizePushAudience(intended, [
      { userId: parentOne, enabled: true },
      { userId: parentBoth, enabled: false },
    ]);
    assert.equal(summary.intended, 3);
    assert.equal(summary.subscribed, 1);
    assert.equal(summary.skipped, 2);
    assert.deepEqual(summary.subscribedUserIds, [parentOne]);
    assert.ok(summary.skippedUserIds.includes(parentBoth));
    assert.ok(summary.skippedUserIds.includes(parentTwo));
  });
});

describe("TN-P5 payload is short title+body+url without PII", () => {
  it("every Stage N template produces a deep-link payload", () => {
    for (const template of NOTICE_TEMPLATE_KEYS) {
      const payload = buildPushPayload("zh-Hant", template, fields);
      assert.ok(payload.title.length > 0, template);
      assert.ok(payload.body.length > 0, template);
      assert.equal(payload.url, fields.appUrl);
      assert.equal(pushPayloadLooksLikeParentPii(payload), false);
      assert.doesNotMatch(payload.body, /123 Example Road/);
      assert.doesNotMatch(payload.title, /0900123456/);
      assert.doesNotMatch(payload.body, /parent@example/);
    }
  });

  it("does not embed phones or emails even if unused records exist", () => {
    const payload = buildPushPayload("en", "thanks", {
      ...fields,
      title: "U8 Tuesday",
    });
    assert.match(payload.title, /Thank you/);
    assert.doesNotMatch(payload.body, /Wei Parent/);
    assert.doesNotMatch(payload.body, /0900123456/);
  });
});

describe("TN-P6 gone subscriptions are disabled once", () => {
  it("treats 410 and 404 as gone and never retries", () => {
    assert.equal(isGonePushStatus(410), true);
    assert.equal(isGonePushStatus(404), true);
    assert.equal(isGonePushStatus(500), false);
    assert.equal(shouldRetryPushAttempt(500), false);
    assert.equal(shouldRetryPushAttempt(429), false);
  });

  it("counts one send per user and lists gone endpoints", () => {
    const plan = summarizePushDelivery(
      [
        { endpoint: "https://push.example/a", userId: parentOne, statusCode: 201, ok: true },
        { endpoint: "https://push.example/b", userId: parentBoth, statusCode: 410, ok: false },
        { endpoint: "https://push.example/c", userId: parentTwo, statusCode: 500, ok: false },
      ],
      [parentOne, parentBoth, parentTwo],
    );
    assert.equal(plan.sent, 1);
    assert.equal(plan.failed, 2);
    assert.deepEqual(plan.goneEndpoints, ["https://push.example/b"]);
  });
});

describe("TN-P7 admin-only send; coaches not added by default", () => {
  it("parents and coaches cannot send; admin can", () => {
    assert.equal(canSendNoticePush(["parent"]), false);
    assert.equal(canSendNoticePush(["coach"]), false);
    assert.equal(canSendNoticePush(["parent", "coach"]), false);
    assert.equal(canSendNoticePush([]), false);
    assert.equal(canSendNoticePush(["admin"]), true);
    assert.equal(canSendNoticePush(["parent", "admin"]), true);
  });

  it("assigned coaches are excluded unless they are approved guardians", () => {
    const recipients = resolveNoticePushRecipients({
      audience: "age_squad",
      teamId: squadId,
      memberships,
      registrations,
      links,
      coachAssignments: [{ profileId: coachOnly, teamId: squadId }],
    });
    assert.equal(recipients.includes(coachOnly), false);
    assert.deepEqual(coachOnlyProfileIds([{ profileId: coachOnly, teamId: squadId }], recipients), [
      coachOnly,
    ]);
  });

  it("blocks production send", () => {
    assert.equal(canSendPushInAppEnv("local"), true);
    assert.equal(canSendPushInAppEnv("staging"), true);
    assert.equal(canSendPushInAppEnv("production"), false);
    assert.equal(canSendPushInAppEnv("unknown"), false);
  });
});
