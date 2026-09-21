import { createClient } from "@/lib/supabase/server";
import type { NoticeAudienceKey } from "@/lib/credits/notice-templates";
import type {
  NoticeGuardianLinkRow,
  NoticeMembershipRow,
  NoticeRegistrationRow,
  NoticeSubscriptionRow,
} from "@/lib/push/audience";
import type { WebPushSubscription } from "@/lib/supabase/database.types";

const IN_CHUNK = 200;

function chunk<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

export async function listActiveMembershipsForTeam(
  teamId: string,
): Promise<NoticeMembershipRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_memberships")
    .select("player_id, team_id, status")
    .eq("team_id", teamId)
    .eq("status", "active");

  if (error) {
    console.error("listActiveMembershipsForTeam", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    playerId: row.player_id,
    teamId: row.team_id,
    status: row.status === "inactive" ? "inactive" : "active",
  }));
}

export async function listRegisteredPlayersForSession(
  sessionId: string,
): Promise<NoticeRegistrationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_registrations")
    .select("player_id, status")
    .eq("session_id", sessionId)
    .eq("status", "registered");

  if (error) {
    console.error("listRegisteredPlayersForSession", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    playerId: row.player_id,
    status: row.status === "cancelled" ? "cancelled" : "registered",
  }));
}

export async function listApprovedGuardiansForPlayers(
  playerIds: readonly string[],
): Promise<NoticeGuardianLinkRow[]> {
  if (playerIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const rows: NoticeGuardianLinkRow[] = [];
  for (const ids of chunk(playerIds, IN_CHUNK)) {
    const { data, error } = await supabase
      .from("guardian_player_links")
      .select("guardian_user_id, player_id, status")
      .in("player_id", ids)
      .eq("status", "approved");

    if (error) {
      console.error("listApprovedGuardiansForPlayers", error.message);
      return rows;
    }

    for (const row of data ?? []) {
      rows.push({
        guardianUserId: row.guardian_user_id,
        playerId: row.player_id,
        status: "approved",
      });
    }
  }
  return rows;
}

export async function listEnabledSubscriptionsForUsers(
  userIds: readonly string[],
): Promise<WebPushSubscription[]> {
  if (userIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const rows: WebPushSubscription[] = [];
  for (const ids of chunk(userIds, IN_CHUNK)) {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", ids)
      .eq("enabled", true);

    if (error) {
      console.error("listEnabledSubscriptionsForUsers", error.message);
      return rows;
    }
    rows.push(...((data ?? []) as WebPushSubscription[]));
  }
  return rows;
}

export async function listOwnPushSubscriptions(): Promise<WebPushSubscription[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listOwnPushSubscriptions", error.message);
    return [];
  }
  return (data ?? []) as WebPushSubscription[];
}

export function subscriptionRowsForSummary(
  rows: readonly WebPushSubscription[],
): NoticeSubscriptionRow[] {
  return rows.map((row) => ({ userId: row.user_id, enabled: row.enabled }));
}

export async function loadAudienceInputs(input: {
  audience: NoticeAudienceKey;
  teamId: string | null;
  sessionId: string;
}): Promise<{
  memberships: NoticeMembershipRow[];
  registrations: NoticeRegistrationRow[];
  links: NoticeGuardianLinkRow[];
}> {
  const memberships =
    input.audience === "session_registrations" || !input.teamId
      ? []
      : await listActiveMembershipsForTeam(input.teamId);
  const registrations =
    input.audience === "session_registrations"
      ? await listRegisteredPlayersForSession(input.sessionId)
      : [];
  const playerIds =
    input.audience === "session_registrations"
      ? registrations.map((row) => row.playerId)
      : memberships.map((row) => row.playerId);
  const links = await listApprovedGuardiansForPlayers(playerIds);
  return { memberships, registrations, links };
}

export async function disablePushSubscriptionsByEndpoints(
  endpoints: readonly string[],
): Promise<void> {
  if (endpoints.length === 0) {
    return;
  }
  const supabase = await createClient();
  for (const group of chunk(endpoints, IN_CHUNK)) {
    const { error } = await supabase
      .from("push_subscriptions")
      .update({ enabled: false })
      .in("endpoint", group);
    if (error) {
      console.error("disablePushSubscriptionsByEndpoints", error.message);
    }
  }
}
