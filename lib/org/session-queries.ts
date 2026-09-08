import { createClient } from "@/lib/supabase/server";
import type {
  AgeBand,
  Player,
  SessionKind,
  SessionRegistration,
  SessionRegistrationMessage,
  Team,
  TrainingSession,
} from "@/lib/supabase/database.types";
import type { GuardianLinkWithPlayer, PlayerWithMembership } from "@/lib/org/queries";
import { uniqueApprovedLinksByPlayerId } from "@/lib/org/guardian-links";
import { isSessionOpenForSignup } from "@/lib/org/session-time";
import { parseSessionKind } from "@/lib/org/session-recurrence";
import { parseUuid } from "@/lib/org/parse";
import {
  COMPETITION_SESSION_KINDS,
  TRAINING_SESSION_KINDS,
  type MatchGroupKey,
} from "@/lib/org/parent-series";
import { tallyRegisteredCounts } from "@/lib/org/registration-counts";
import type { SessionWindowProbe } from "@/lib/org/session-calendar";
import { filterDefaultAdminList, filterParentDefaultList } from "@/lib/org/soft-delete";

export type TrainingSessionWithTeam = TrainingSession & {
  team: Team | null;
};

export type SessionRegistrationMessageRow = SessionRegistrationMessage;

export type SessionRegistrationWithDetails = SessionRegistration & {
  session: TrainingSessionWithTeam | null;
  player: Player | null;
  messages: SessionRegistrationMessageRow[];
};

export type TrainingSessionAdminRow = TrainingSessionWithTeam & {
  registeredCount: number;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapSessionRow(row: Record<string, unknown>): TrainingSessionWithTeam {
  const { teams, ...session } = row;
  return {
    ...(session as TrainingSession),
    team: one(teams as Team | Team[] | null),
  };
}

function mapMessageRow(row: Record<string, unknown>): SessionRegistrationMessageRow {
  return row as unknown as SessionRegistrationMessageRow;
}

function mapRegistrationRow(row: Record<string, unknown>): SessionRegistrationWithDetails {
  const { training_sessions, players, session_registration_messages, ...registration } = row;
  const sessionSource = training_sessions as
    | (TrainingSession & { teams?: Team | Team[] | null })
    | (TrainingSession & { teams?: Team | Team[] | null })[]
    | null;
  const sessionRow = one(sessionSource);
  const session = sessionRow
    ? mapSessionRow(sessionRow as unknown as Record<string, unknown>)
    : null;

  return {
    ...(registration as SessionRegistration),
    session,
    player: one(players as Player | Player[] | null),
    messages: ((session_registration_messages as Record<string, unknown>[] | null) ?? [])
      .map(mapMessageRow)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
  };
}

export type SessionStartsWindow = {
  startsFrom?: string;
  startsToExclusive?: string;
};

export type AdminSessionListFilters = SessionStartsWindow & {
  kinds?: string[];
  teamIds?: string[];
  includeDeleted?: boolean;
};

export async function listSessionsForAdmin(
  filters: AdminSessionListFilters = {},
): Promise<TrainingSessionAdminRow[]> {
  const supabase = await createClient();
  let sessionsQuery = supabase
    .from("training_sessions")
    .select("*, teams(*)")
    .order("starts_at", { ascending: true });

  const kinds = (filters.kinds ?? [])
    .map((value) => parseSessionKind(value))
    .filter((kind): kind is NonNullable<typeof kind> => kind !== null);
  if (kinds.length > 0) {
    sessionsQuery = sessionsQuery.in("kind", kinds);
  }
  const teamIds = (filters.teamIds ?? [])
    .map((value) => parseUuid(value))
    .filter((id): id is string => id !== null);
  if (teamIds.length > 0) {
    sessionsQuery = sessionsQuery.in("team_id", teamIds);
  }
  if (!filters.includeDeleted) {
    sessionsQuery = sessionsQuery.is("deleted_at", null);
  }
  if (filters.startsFrom) {
    sessionsQuery = sessionsQuery.gte("starts_at", filters.startsFrom);
  }
  if (filters.startsToExclusive) {
    sessionsQuery = sessionsQuery.lt("starts_at", filters.startsToExclusive);
  }

  const sessionsResult = await sessionsQuery;

  if (sessionsResult.error) {
    console.error("listSessionsForAdmin", sessionsResult.error.message);
    return [];
  }

  const sessionIds = (sessionsResult.data ?? []).map((row) => row.id as string);
  let registeredBySession = new Map<string, number>();
  if (sessionIds.length > 0) {
    const countsResult = await supabase
      .from("session_registrations")
      .select("session_id, status")
      .in("session_id", sessionIds);
    if (countsResult.error) {
      console.error("listSessionsForAdmin counts", countsResult.error.message);
    }
    registeredBySession = tallyRegisteredCounts(countsResult.data ?? []);
  }

  const rows = (sessionsResult.data ?? []).map((row) => {
    const session = mapSessionRow(row as unknown as Record<string, unknown>);
    return {
      ...session,
      registeredCount: registeredBySession.get(session.id) ?? 0,
    };
  });
  return filterDefaultAdminList(rows, Boolean(filters.includeDeleted));
}

export async function probeSessionsForAdmin(
  filters: AdminSessionListFilters & { startsFrom: string; startsToExclusive: string },
): Promise<SessionWindowProbe> {
  const supabase = await createClient();
  const kinds = (filters.kinds ?? [])
    .map((value) => parseSessionKind(value))
    .filter((kind): kind is NonNullable<typeof kind> => kind !== null);
  const teamIds = (filters.teamIds ?? [])
    .map((value) => parseUuid(value))
    .filter((id): id is string => id !== null);

  const base = () => {
    let query = supabase.from("training_sessions").select("id").limit(1);
    if (kinds.length > 0) {
      query = query.in("kind", kinds);
    }
    if (teamIds.length > 0) {
      query = query.in("team_id", teamIds);
    }
    if (!filters.includeDeleted) {
      query = query.is("deleted_at", null);
    }
    return query;
  };

  const [earlier, later] = await Promise.all([
    base().lt("starts_at", filters.startsFrom),
    base().gte("starts_at", filters.startsToExclusive),
  ]);
  if (earlier.error) {
    console.error("probeSessionsForAdmin earlier", earlier.error.message);
  }
  if (later.error) {
    console.error("probeSessionsForAdmin later", later.error.message);
  }
  return {
    hasEarlier: (earlier.data ?? []).length > 0,
    hasLater: (later.data ?? []).length > 0,
  };
}

export async function getSession(id: string): Promise<TrainingSessionWithTeam | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_sessions")
    .select("*, teams(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getSession", error.message);
    return null;
  }
  if (!data) {
    return null;
  }
  return mapSessionRow(data as unknown as Record<string, unknown>);
}

export async function listSessionRegistrations(
  sessionId: string,
): Promise<SessionRegistrationWithDetails[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_registrations")
    .select("*, players(*), training_sessions(*, teams(*)), session_registration_messages(*)")
    .eq("session_id", sessionId)
    .order("created_at");

  if (error) {
    console.error("listSessionRegistrations", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapRegistrationRow(row as unknown as Record<string, unknown>));
}

function applyStartsWindow<
  T extends { gte: (column: string, value: string) => T; lt: (column: string, value: string) => T },
>(query: T, window?: SessionStartsWindow): T {
  let next = query;
  if (window?.startsFrom) {
    next = next.gte("starts_at", window.startsFrom);
  }
  if (window?.startsToExclusive) {
    next = next.lt("starts_at", window.startsToExclusive);
  }
  return next;
}

export async function listOpenSessionsForParent(
  teamIds: string[],
  kinds?: readonly SessionKind[],
  window?: SessionStartsWindow,
): Promise<TrainingSessionWithTeam[]> {
  if (teamIds.length === 0) {
    return [];
  }

  const now = new Date();
  const supabase = await createClient();
  let query = supabase
    .from("training_sessions")
    .select("*, teams(*)")
    .eq("status", "active")
    .is("deleted_at", null)
    .in("team_id", teamIds)
    .gt("ends_at", now.toISOString())
    .order("starts_at");

  if (kinds && kinds.length > 0) {
    query = query.in("kind", kinds);
  }
  query = applyStartsWindow(query, window);

  const { data, error } = await query;

  if (error) {
    console.error("listOpenSessionsForParent", error.message);
    return [];
  }

  return filterParentDefaultList(
    (data ?? [])
      .map((row) => mapSessionRow(row as unknown as Record<string, unknown>))
      .filter((session) => isSessionOpenForSignup(session, now)),
  );
}

export async function probeOpenSessionsForParent(
  teamIds: string[],
  kinds: readonly SessionKind[] | undefined,
  window: { startsFrom: string; startsToExclusive: string },
  now = new Date(),
): Promise<SessionWindowProbe> {
  if (teamIds.length === 0) {
    return { hasEarlier: false, hasLater: false };
  }

  const supabase = await createClient();
  const nowIso = now.toISOString();

  const base = () => {
    let query = supabase
      .from("training_sessions")
      .select("id")
      .eq("status", "active")
      .is("deleted_at", null)
      .in("team_id", teamIds)
      .limit(1);
    if (kinds && kinds.length > 0) {
      query = query.in("kind", kinds);
    }
    return query;
  };

  const [earlier, later] = await Promise.all([
    base().gt("ends_at", nowIso).lt("starts_at", window.startsFrom),
    base().gte("starts_at", window.startsToExclusive),
  ]);
  if (earlier.error) {
    console.error("probeOpenSessionsForParent earlier", earlier.error.message);
  }
  if (later.error) {
    console.error("probeOpenSessionsForParent later", later.error.message);
  }
  return {
    hasEarlier: (earlier.data ?? []).length > 0,
    hasLater: (later.data ?? []).length > 0,
  };
}

export async function listOpenTrainingSessionsForParent(
  teamIds: string[],
  window?: SessionStartsWindow,
): Promise<TrainingSessionWithTeam[]> {
  return listOpenSessionsForParent(teamIds, TRAINING_SESSION_KINDS, window);
}

export async function listOpenCompetitionSessionsForParent(
  teamIds: string[],
  window?: SessionStartsWindow,
): Promise<TrainingSessionWithTeam[]> {
  return listOpenSessionsForParent(teamIds, COMPETITION_SESSION_KINDS, window);
}

export async function listOpenSessionsForParentSeries(
  seriesId: string,
  teamIds: string[],
): Promise<TrainingSessionWithTeam[]> {
  if (!parseUuid(seriesId) || teamIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_sessions")
    .select("*, teams(*)")
    .eq("series_id", seriesId)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("team_id", teamIds)
    .in("kind", TRAINING_SESSION_KINDS)
    .gt("ends_at", new Date().toISOString())
    .order("starts_at");

  if (error) {
    console.error("listOpenSessionsForParentSeries", error.message);
    return [];
  }

  const now = new Date();
  return filterParentDefaultList(
    (data ?? [])
      .map((row) => mapSessionRow(row as unknown as Record<string, unknown>))
      .filter((session) => isSessionOpenForSignup(session, now)),
  );
}

export async function listOpenSessionsForMatchGroup(
  group: MatchGroupKey,
  teamIds: string[],
): Promise<TrainingSessionWithTeam[]> {
  if (!teamIds.includes(group.teamId)) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_sessions")
    .select("*, teams(*)")
    .eq("team_id", group.teamId)
    .eq("kind", group.kind)
    .eq("title", group.title)
    .eq("status", "active")
    .is("deleted_at", null)
    .gt("ends_at", new Date().toISOString())
    .order("starts_at");

  if (error) {
    console.error("listOpenSessionsForMatchGroup", error.message);
    return [];
  }

  const now = new Date();
  return filterParentDefaultList(
    (data ?? [])
      .map((row) => mapSessionRow(row as unknown as Record<string, unknown>))
      .filter((session) => isSessionOpenForSignup(session, now)),
  );
}

export async function listOwnSessionRegistrations(
  playerIds: string[],
): Promise<SessionRegistrationWithDetails[]> {
  if (playerIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_registrations")
    .select("*, players(*), training_sessions(*, teams(*)), session_registration_messages(*)")
    .in("player_id", playerIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listOwnSessionRegistrations", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapRegistrationRow(row as unknown as Record<string, unknown>));
}

export async function listCoachSessions(): Promise<TrainingSessionAdminRow[]> {
  const supabase = await createClient();
  const [sessionsResult, countsResult] = await Promise.all([
    supabase
      .from("training_sessions")
      .select("*, teams(*)")
      .order("starts_at", { ascending: false }),
    supabase.from("session_registrations").select("session_id, status"),
  ]);

  if (sessionsResult.error) {
    console.error("listCoachSessions", sessionsResult.error.message);
    return [];
  }
  if (countsResult.error) {
    console.error("listCoachSessions counts", countsResult.error.message);
  }

  const registeredBySession = tallyRegisteredCounts(countsResult.data ?? []);

  return (sessionsResult.data ?? []).map((row) => {
    const session = mapSessionRow(row as unknown as Record<string, unknown>);
    return {
      ...session,
      registeredCount: registeredBySession.get(session.id) ?? 0,
    };
  });
}

export async function listCoachRegisteredPlayers(): Promise<SessionRegistrationWithDetails[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_registrations")
    .select("*, players(*), training_sessions(*, teams(*)), session_registration_messages(*)")
    .eq("status", "registered")
    .order("created_at");

  if (error) {
    console.error("listCoachRegisteredPlayers", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapRegistrationRow(row as unknown as Record<string, unknown>));
}

export type EligibleChild = {
  linkId: string;
  player: PlayerWithMembership;
  teamId: string;
  teamName: string;
  jerseyNumber: number;
  teamAgeBand: AgeBand;
};

export function eligibleChildrenForSession(
  children: EligibleChild[],
  session: TrainingSession,
  registrations: SessionRegistrationWithDetails[],
): EligibleChild[] {
  const registeredPlayerIds = new Set(
    registrations
      .filter((row) => row.session_id === session.id && row.status === "registered")
      .map((row) => row.player_id),
  );
  return children.filter(
    (child) => child.teamId === session.team_id && !registeredPlayerIds.has(child.player.id),
  );
}

export function childrenOnSessionTeam(
  children: EligibleChild[],
  teamId: string,
): EligibleChild[] {
  return children.filter((child) => child.teamId === teamId);
}

export function openRegistrationForPlayer(
  registrations: SessionRegistrationWithDetails[],
  sessionId: string,
  playerId: string,
): SessionRegistrationWithDetails | undefined {
  return registrations.find(
    (row) =>
      row.session_id === sessionId &&
      row.player_id === playerId &&
      row.status === "registered",
  );
}

export function openSessionsForChildTeam(
  sessions: TrainingSessionWithTeam[],
  teamId: string,
  exceptSessionId?: string,
): TrainingSessionWithTeam[] {
  return sessions.filter(
    (session) => session.team_id === teamId && session.id !== exceptSessionId,
  );
}

export function approvedChildrenFromLinks(
  links: GuardianLinkWithPlayer[],
  teamKind?: "age_squad" | "competition_team",
): EligibleChild[] {
  const result: EligibleChild[] = [];
  for (const link of uniqueApprovedLinksByPlayerId(links)) {
    if (!link.player) {
      continue;
    }
    const memberships = (link.player.memberships ?? []).filter(
      (row) =>
        row.status === "active" &&
        row.team &&
        (!teamKind || row.team.kind === teamKind),
    );
    const rows =
      memberships.length > 0
        ? memberships
        : link.player.membership?.status === "active" &&
            link.player.membership.team &&
            (!teamKind || link.player.membership.team.kind === teamKind)
          ? [link.player.membership]
          : [];
    for (const membership of rows) {
      if (!membership.team) {
        continue;
      }
      result.push({
        linkId: link.id,
        player: link.player,
        teamId: membership.team_id,
        teamName: membership.team.name,
        jerseyNumber: membership.jersey_number,
        teamAgeBand: membership.team.age_band,
      });
    }
  }
  return result;
}

/** One row per player, keeping the first (most recently updated active) membership. */
export function uniqueEligibleChildrenByPlayer(
  children: EligibleChild[],
): EligibleChild[] {
  const seen = new Set<string>();
  const result: EligibleChild[] = [];
  for (const child of children) {
    if (seen.has(child.player.id)) {
      continue;
    }
    seen.add(child.player.id);
    result.push(child);
  }
  return result;
}
