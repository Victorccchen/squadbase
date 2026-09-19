/**
 * Stage Notif: resolve Stage N audiences to approved guardian user_ids
 * and summarize who can actually receive Web Push.
 *
 * Coaches are not added from team assignments. A coach who is also an
 * approved guardian of a child in the audience still receives as a parent.
 */

import { canAccessAdmin } from "../auth/roles.ts";
import type { NoticeAudienceKey } from "../credits/notice-templates.ts";
import type { AppRole } from "../supabase/database.types.ts";

export type NoticeMembershipRow = {
  playerId: string;
  teamId: string;
  status: "active" | "inactive";
};

export type NoticeGuardianLinkRow = {
  guardianUserId: string;
  playerId: string;
  status: "pending" | "approved" | "rejected" | "revoked";
};

export type NoticeRegistrationRow = {
  playerId: string;
  status: "registered" | "cancelled";
};

export type NoticeCoachAssignmentRow = {
  profileId: string;
  teamId: string;
};

export type NoticeSubscriptionRow = {
  userId: string;
  enabled: boolean;
};

export type PushAudienceSummary = {
  intendedUserIds: string[];
  subscribedUserIds: string[];
  skippedUserIds: string[];
  intended: number;
  subscribed: number;
  skipped: number;
};

export function canSendNoticePush(roles: readonly AppRole[]): boolean {
  return canAccessAdmin([...roles]);
}

export function resolveAudiencePlayerIds(input: {
  audience: NoticeAudienceKey;
  teamId: string | null;
  memberships: readonly NoticeMembershipRow[];
  registrations: readonly NoticeRegistrationRow[];
}): string[] {
  if (input.audience === "session_registrations") {
    const ids = new Set<string>();
    for (const row of input.registrations) {
      if (row.status === "registered") {
        ids.add(row.playerId);
      }
    }
    return [...ids];
  }

  const teamId = input.teamId?.trim() ?? "";
  if (!teamId) {
    return [];
  }

  const ids = new Set<string>();
  for (const row of input.memberships) {
    if (row.teamId === teamId && row.status === "active") {
      ids.add(row.playerId);
    }
  }
  return [...ids];
}

export function resolveApprovedGuardianUserIds(
  playerIds: readonly string[],
  links: readonly NoticeGuardianLinkRow[],
): string[] {
  const wanted = new Set(playerIds);
  const userIds = new Set<string>();
  for (const link of links) {
    if (link.status === "approved" && wanted.has(link.playerId)) {
      userIds.add(link.guardianUserId);
    }
  }
  return [...userIds];
}

/**
 * Approved guardians of the Stage N audience, one user_id even when
 * several children match. Coach assignments are ignored.
 */
export function resolveNoticePushRecipients(input: {
  audience: NoticeAudienceKey;
  teamId: string | null;
  memberships: readonly NoticeMembershipRow[];
  registrations: readonly NoticeRegistrationRow[];
  links: readonly NoticeGuardianLinkRow[];
  coachAssignments?: readonly NoticeCoachAssignmentRow[];
}): string[] {
  const playerIds = resolveAudiencePlayerIds(input);
  return resolveApprovedGuardianUserIds(playerIds, input.links);
}

export function summarizePushAudience(
  intendedUserIds: readonly string[],
  subscriptions: readonly NoticeSubscriptionRow[],
): PushAudienceSummary {
  const uniqueIntended = [...new Set(intendedUserIds)];
  const subscribed = new Set<string>();
  for (const row of subscriptions) {
    if (row.enabled) {
      subscribed.add(row.userId);
    }
  }

  const subscribedUserIds = uniqueIntended.filter((id) => subscribed.has(id));
  const skippedUserIds = uniqueIntended.filter((id) => !subscribed.has(id));

  return {
    intendedUserIds: uniqueIntended,
    subscribedUserIds,
    skippedUserIds,
    intended: uniqueIntended.length,
    subscribed: subscribedUserIds.length,
    skipped: skippedUserIds.length,
  };
}

export function coachOnlyProfileIds(
  coachAssignments: readonly NoticeCoachAssignmentRow[],
  guardianUserIds: readonly string[],
): string[] {
  const guardians = new Set(guardianUserIds);
  const coaches = new Set<string>();
  for (const row of coachAssignments) {
    if (!guardians.has(row.profileId)) {
      coaches.add(row.profileId);
    }
  }
  return [...coaches];
}
