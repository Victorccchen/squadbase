"use server";

import webpush from "web-push";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { publicAppOrigin } from "@/lib/credits/queries";
import {
  announcementFieldsFromSource,
  parseNoticeAudienceKey,
  parseNoticeTemplateKey,
  type NoticeAudienceKey,
  type NoticeSourceSnapshot,
  type NoticeTemplateKey,
} from "@/lib/credits/notice-templates";
import type { NoticeLocale } from "@/lib/credits/notice";
import { formatMatchScore } from "@/lib/org/match";
import { getMatchForStaff } from "@/lib/org/match-queries";
import {
  INITIAL_ORG_ACTION_STATE,
  INITIAL_PUSH_PREVIEW_STATE,
  INITIAL_PUSH_SEND_STATE,
  type OrgActionState,
  type OrgErrorKey,
  type PushPreviewState,
  type PushSendState,
} from "@/lib/org/errors";
import { parseUuid, readString } from "@/lib/org/parse";
import { formatClubDateTime, formatClubDateTimeRange } from "@/lib/org/session-time";
import { getSession, listSessionRegistrations } from "@/lib/org/session-queries";
import { parseAppLocale } from "@/i18n/routing";
import {
  canSendNoticePush,
  resolveNoticePushRecipients,
  summarizePushAudience,
} from "@/lib/push/audience";
import {
  isGonePushStatus,
  pushStatusCodeFromError,
  summarizePushDelivery,
  type PushDeliveryAttempt,
} from "@/lib/push/delivery";
import { canSendPushInAppEnv, getVapidConfig } from "@/lib/push/env";
import { buildPushPayload, pushPayloadLooksLikeParentPii } from "@/lib/push/payload";
import {
  disablePushSubscriptionsByEndpoints,
  listEnabledSubscriptionsForUsers,
  loadAudienceInputs,
  subscriptionRowsForSummary,
} from "@/lib/push/queries";

function failOrg(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

function failPreview(errorKey: OrgErrorKey): PushPreviewState {
  return { ...INITIAL_PUSH_PREVIEW_STATE, errorKey };
}

function failSend(errorKey: OrgErrorKey): PushSendState {
  return { ...INITIAL_PUSH_SEND_STATE, errorKey };
}

async function requireConfiguredUser() {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false as const, errorKey: "notConfigured" as const };
  }
  const account = await loadSignedInAccount();
  if (!account.user) {
    return { ok: false as const, errorKey: "forbidden" as const };
  }
  return { ok: true as const, ...account, supabase: await createClient() };
}

function parsePushRequest(formData: FormData): {
  sessionId: string | null;
  template: NoticeTemplateKey | null;
  audience: NoticeAudienceKey | null;
  teamId: string | null;
  locale: NoticeLocale;
  kit: string;
  gear: string;
  gather: string;
  recap: string;
} {
  return {
    sessionId: parseUuid(readString(formData, "session_id")),
    template: parseNoticeTemplateKey(readString(formData, "template")),
    audience: parseNoticeAudienceKey(readString(formData, "audience")),
    teamId: parseUuid(readString(formData, "team_id")),
    locale: parseAppLocale(readString(formData, "copy_locale") || readString(formData, "locale")),
    kit: readString(formData, "kit"),
    gear: readString(formData, "gear"),
    gather: readString(formData, "gather"),
    recap: readString(formData, "recap"),
  };
}

async function loadNoticeSource(sessionId: string): Promise<NoticeSourceSnapshot | null> {
  const [session, match, regs] = await Promise.all([
    getSession(sessionId),
    getMatchForStaff(sessionId),
    listSessionRegistrations(sessionId),
  ]);
  const registeredCount = regs.filter((row) => row.status === "registered").length;
  if (match) {
    return {
      id: match.id,
      title: match.title,
      kind: match.kind,
      startsAt: match.starts_at,
      endsAt: match.ends_at,
      location: match.location ?? "",
      teamId: match.team_id,
      teamName: match.team?.name ?? "",
      teamKind: match.team?.kind ?? null,
      teamAgeBand: match.team?.age_band ?? null,
      eligibleBirthAges: match.team?.eligible_birth_ages ?? [],
      registeredCount,
      opponent: match.publication.opponent ?? "",
      score: formatMatchScore(match.publication.club_score, match.publication.opponent_score) ?? "",
      recap: match.publication.result_note ?? "",
      publicStatus: match.publication.public_status,
    };
  }
  if (!session) {
    return null;
  }
  return {
    id: session.id,
    title: session.title,
    kind: session.kind,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    location: session.location ?? "",
    teamId: session.team_id,
    teamName: session.team?.name ?? "",
    teamKind: session.team?.kind ?? null,
    teamAgeBand: session.team?.age_band ?? null,
    eligibleBirthAges: session.team?.eligible_birth_ages ?? [],
    registeredCount,
    opponent: "",
    score: "",
    recap: "",
    publicStatus: null,
  };
}

async function previewForAdmin(input: {
  sessionId: string;
  audience: NoticeAudienceKey;
  teamId: string | null;
}): Promise<PushPreviewState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return failPreview(actor.errorKey);
  }
  if (!canSendNoticePush(actor.roles)) {
    return failPreview("forbidden");
  }

  const audienceInputs = await loadAudienceInputs({
    audience: input.audience,
    teamId: input.audience === "session_registrations" ? null : input.teamId,
    sessionId: input.sessionId,
  });
  const intended = resolveNoticePushRecipients({
    audience: input.audience,
    teamId: input.audience === "session_registrations" ? null : input.teamId,
    ...audienceInputs,
  });
  const subscriptions = await listEnabledSubscriptionsForUsers(intended);
  const summary = summarizePushAudience(intended, subscriptionRowsForSummary(subscriptions));
  return {
    ok: true,
    errorKey: null,
    intended: summary.intended,
    subscribed: summary.subscribed,
    skipped: summary.skipped,
  };
}

export async function previewNoticePush(
  _prev: PushPreviewState,
  formData: FormData,
): Promise<PushPreviewState> {
  const parsed = parsePushRequest(formData);
  if (!parsed.sessionId) {
    return failPreview("sessionNotFound");
  }
  if (!parsed.template || !parsed.audience) {
    return failPreview("generic");
  }
  if (parsed.audience !== "session_registrations" && !parsed.teamId) {
    return failPreview("missingTeam");
  }
  return previewForAdmin({
    sessionId: parsed.sessionId,
    audience: parsed.audience,
    teamId: parsed.teamId,
  });
}

export async function sendNoticePush(
  _prev: PushSendState,
  formData: FormData,
): Promise<PushSendState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return failSend(actor.errorKey);
  }
  if (!canSendNoticePush(actor.roles)) {
    return failSend("forbidden");
  }
  if (!canSendPushInAppEnv()) {
    return failSend("pushProductionBlocked");
  }
  const vapid = getVapidConfig();
  if (!vapid) {
    return failSend("pushNotConfigured");
  }

  const parsed = parsePushRequest(formData);
  if (!parsed.sessionId || !parsed.template || !parsed.audience) {
    return failSend("sessionNotFound");
  }
  if (parsed.audience !== "session_registrations" && !parsed.teamId) {
    return failSend("missingTeam");
  }

  const source = await loadNoticeSource(parsed.sessionId);
  if (!source) {
    return failSend("sessionNotFound");
  }

  const payload = buildPushPayload(
    parsed.locale,
    parsed.template,
    announcementFieldsFromSource(source, {
      origin: publicAppOrigin(),
      locale: parsed.locale,
      timeRange: formatClubDateTimeRange(source.startsAt, source.endsAt, parsed.locale),
      deadline: formatClubDateTime(source.startsAt, parsed.locale),
      kit: parsed.kit,
      gear: parsed.gear,
      gather: parsed.gather,
      recap: parsed.recap,
    }),
  );
  if (pushPayloadLooksLikeParentPii(payload) || !payload.url) {
    return failSend("generic");
  }

  const audienceInputs = await loadAudienceInputs({
    audience: parsed.audience,
    teamId: parsed.audience === "session_registrations" ? null : parsed.teamId,
    sessionId: parsed.sessionId,
  });
  const intended = resolveNoticePushRecipients({
    audience: parsed.audience,
    teamId: parsed.audience === "session_registrations" ? null : parsed.teamId,
    ...audienceInputs,
  });
  const subscriptions = await listEnabledSubscriptionsForUsers(intended);
  const summary = summarizePushAudience(intended, subscriptionRowsForSummary(subscriptions));

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });

  const attempts: PushDeliveryAttempt[] = [];
  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        body,
      );
      attempts.push({ endpoint: row.endpoint, userId: row.user_id, statusCode: 201, ok: true });
    } catch (error) {
      const statusCode = pushStatusCodeFromError(error);
      attempts.push({
        endpoint: row.endpoint,
        userId: row.user_id,
        statusCode,
        ok: false,
      });
    }
  }

  const delivery = summarizePushDelivery(attempts, summary.subscribedUserIds);
  const gone = delivery.goneEndpoints.filter((endpoint) =>
    attempts.some((attempt) => attempt.endpoint === endpoint && isGonePushStatus(attempt.statusCode)),
  );
  await disablePushSubscriptionsByEndpoints(gone);

  const { error: logError } = await actor.supabase.from("notification_sends").insert({
    sent_by: actor.user.id,
    template_key: parsed.template,
    audience_key: parsed.audience,
    source_session_id: parsed.sessionId,
    audience_team_id: parsed.audience === "session_registrations" ? source.teamId : parsed.teamId,
    locale: parsed.locale,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    intended_count: summary.intended,
    subscribed_count: summary.subscribed,
    skipped_count: summary.skipped,
    sent_count: delivery.sent,
    failed_count: delivery.failed,
  });
  if (logError) {
    console.error("notification_sends insert", logError.message);
  }

  return {
    ok: true,
    errorKey: null,
    intended: summary.intended,
    subscribed: summary.subscribed,
    skipped: summary.skipped,
    sent: delivery.sent,
    failed: delivery.failed,
  };
}

export async function saveOwnPushSubscription(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return failOrg(actor.errorKey);
  }

  const endpoint = readString(formData, "endpoint");
  const p256dh = readString(formData, "p256dh");
  const auth = readString(formData, "auth");
  const userAgent = readString(formData, "user_agent").slice(0, 500);
  if (!endpoint || !p256dh || !auth) {
    return failOrg("pushSubscribeFailed");
  }

  const { data: existing, error: existingError } = await actor.supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (existingError) {
    console.error("saveOwnPushSubscription lookup", existingError.message);
    return failOrg("generic");
  }

  if (existing?.id) {
    const { error } = await actor.supabase
      .from("push_subscriptions")
      .update({
        p256dh,
        auth,
        user_agent: userAgent || null,
        enabled: true,
      })
      .eq("id", existing.id)
      .eq("user_id", actor.user.id);
    if (error) {
      console.error("saveOwnPushSubscription update", error.message);
      return failOrg("generic");
    }
    return { ok: true, errorKey: null };
  }

  const { error } = await actor.supabase.from("push_subscriptions").insert({
    user_id: actor.user.id,
    endpoint,
    p256dh,
    auth,
    user_agent: userAgent || null,
    enabled: true,
  });
  if (error) {
    console.error("saveOwnPushSubscription insert", error.message);
    return failOrg("generic");
  }
  return { ok: true, errorKey: null };
}

export async function disableOwnPushSubscriptions(
  prev: OrgActionState = INITIAL_ORG_ACTION_STATE,
  formData?: FormData,
): Promise<OrgActionState> {
  void prev;
  void formData;
  const actor = await requireConfiguredUser();
  if (!actor.ok) {
    return failOrg(actor.errorKey);
  }

  const { error } = await actor.supabase
    .from("push_subscriptions")
    .update({ enabled: false })
    .eq("user_id", actor.user.id);
  if (error) {
    console.error("disableOwnPushSubscriptions", error.message);
    return failOrg("generic");
  }
  return { ok: true, errorKey: null };
}
