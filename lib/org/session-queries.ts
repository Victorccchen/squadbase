import { createClient } from "@/lib/supabase/server";
import type {
  Player,
  SessionRegistration,
  SessionRegistrationMessage,
  Team,
  TrainingSession,
} from "@/lib/supabase/database.types";
import type { GuardianLinkWithPlayer } from "@/lib/org/queries";
import { isSessionOpenForSignup } from "@/lib/org/session-time";

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

export async function listSessionsForAdmin(): Promise<TrainingSessionAdminRow[]> {
  const supabase = await createClient();
  const [sessionsResult, countsResult] = await Promise.all([
    supabase
      .from("training_sessions")
      .select("*, teams(*)")
      .order("starts_at", { ascending: false }),
    supabase.from("session_registrations").select("session_id, status"),
  ]);

  if (sessionsResult.error) {
    console.error("listSessionsForAdmin", sessionsResult.error.message);
    return [];
  }
  if (countsResult.error) {
    console.error("listSessionsForAdmin counts", countsResult.error.message);
  }

  const registeredBySession = new Map<string, number>();
  for (const row of countsResult.data ?? []) {
    if (row.status !== "registered") {
      continue;
    }
    registeredBySession.set(row.session_id, (registeredBySession.get(row.session_id) ?? 0) + 1);
  }

  return (sessionsResult.data ?? []).map((row) => {
    const session = mapSessionRow(row as unknown as Record<string, unknown>);
    return {
      ...session,
      registeredCount: registeredBySession.get(session.id) ?? 0,
    };
  });
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

export async function listOpenSessionsForParent(
  teamIds: string[],
): Promise<TrainingSessionWithTeam[]> {
  if (teamIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_sessions")
    .select("*, teams(*)")
    .eq("status", "active")
    .in("team_id", teamIds)
    .order("starts_at");

  if (error) {
    console.error("listOpenSessionsForParent", error.message);
    return [];
  }

  const now = new Date();
  return (data ?? [])
    .map((row) => mapSessionRow(row as unknown as Record<string, unknown>))
    .filter((session) => isSessionOpenForSignup(session, now));
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

  const registeredBySession = new Map<string, number>();
  for (const row of countsResult.data ?? []) {
    if (row.status !== "registered") {
      continue;
    }
    registeredBySession.set(row.session_id, (registeredBySession.get(row.session_id) ?? 0) + 1);
  }

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
  player: Player;
  teamId: string;
  teamName: string;
  jerseyNumber: number;
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
): EligibleChild[] {
  const result: EligibleChild[] = [];
  for (const link of links) {
    if (link.status !== "approved" || !link.player) {
      continue;
    }
    const membership = link.player.membership;
    if (!membership?.team || membership.status !== "active") {
      continue;
    }
    result.push({
      player: link.player,
      teamId: membership.team_id,
      teamName: membership.team.name,
      jerseyNumber: membership.jersey_number,
    });
  }
  return result;
}
