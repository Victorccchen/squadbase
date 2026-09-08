import { createClient } from "@/lib/supabase/server";
import { getPublicSupabaseEnv } from "@/lib/env";
import { isMatchKind, parseMatchKind, partitionPublicMatches } from "@/lib/org/match";
import { parseUuid } from "@/lib/org/parse";
import { tallyRegisteredCounts } from "@/lib/org/registration-counts";
import type { SessionWindowProbe } from "@/lib/org/session-calendar";
import { filterDefaultAdminList } from "@/lib/org/soft-delete";
import type {
  MatchPublication,
  MatchRosterRow,
  Player,
  PublishedMatch,
  PublishedMatchRosterEntry,
  Team,
  TrainingSession,
} from "@/lib/supabase/database.types";

export type MatchAdminRow = TrainingSession & {
  team: Team | null;
  publication: MatchPublication;
  rosterCount: number;
  registeredCount: number;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function listPublishedMatches(): Promise<PublishedMatch[]> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_published_matches");
  if (error) {
    console.error("listPublishedMatches", error.message);
    return [];
  }
  return data ?? [];
}

export async function listPartitionedPublishedMatches(now = new Date()): Promise<{
  upcoming: PublishedMatch[];
  recentPast: PublishedMatch[];
}> {
  const matches = await listPublishedMatches();
  return partitionPublicMatches(matches, now.getTime());
}

export async function getPublishedMatch(id: string): Promise<PublishedMatch | null> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_published_match", {
    p_session_id: id,
  });
  if (error) {
    console.error("getPublishedMatch", error.message);
    return null;
  }
  return data?.[0] ?? null;
}

export async function listPublishedMatchRoster(
  id: string,
): Promise<PublishedMatchRosterEntry[]> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_published_match_roster", {
    p_session_id: id,
  });
  if (error) {
    console.error("listPublishedMatchRoster", error.message);
    return [];
  }
  return data ?? [];
}

export type AdminMatchListFilters = {
  kinds?: string[];
  teamIds?: string[];
  startsFrom?: string;
  startsToExclusive?: string;
  includeDeleted?: boolean;
};

export async function listMatchesForAdmin(
  filters: AdminMatchListFilters = {},
): Promise<MatchAdminRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("match_publications")
    .select("*, training_sessions!inner(*, teams(*))")
    .order("created_at", { ascending: false });

  const kinds = (filters.kinds ?? [])
    .map((value) => parseMatchKind(value))
    .filter((kind): kind is NonNullable<typeof kind> => kind !== null);
  if (kinds.length > 0) {
    query = query.in("training_sessions.kind", kinds);
  }
  const teamIds = (filters.teamIds ?? [])
    .map((value) => parseUuid(value))
    .filter((id): id is string => id !== null);
  if (teamIds.length > 0) {
    query = query.in("training_sessions.team_id", teamIds);
  }
  if (filters.startsFrom) {
    query = query.gte("training_sessions.starts_at", filters.startsFrom);
  }
  if (filters.startsToExclusive) {
    query = query.lt("training_sessions.starts_at", filters.startsToExclusive);
  }
  if (!filters.includeDeleted) {
    query = query.is("training_sessions.deleted_at", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("listMatchesForAdmin", error.message);
    return [];
  }

  const sessionIds = (data ?? []).map((row) => row.session_id);
  const rosterCountBySession = new Map<string, number>();
  let registeredBySession = new Map<string, number>();
  if (sessionIds.length > 0) {
    const [rosterResult, countsResult] = await Promise.all([
      supabase.from("match_roster").select("session_id").in("session_id", sessionIds),
      supabase
        .from("session_registrations")
        .select("session_id, status")
        .in("session_id", sessionIds),
    ]);
    if (rosterResult.error) {
      console.error("listMatchesForAdmin roster", rosterResult.error.message);
    }
    if (countsResult.error) {
      console.error("listMatchesForAdmin registrations", countsResult.error.message);
    }
    for (const row of rosterResult.data ?? []) {
      rosterCountBySession.set(
        row.session_id,
        (rosterCountBySession.get(row.session_id) ?? 0) + 1,
      );
    }
    registeredBySession = tallyRegisteredCounts(countsResult.data ?? []);
  }

  const rows: MatchAdminRow[] = [];
  for (const row of data ?? []) {
    const { training_sessions, ...publication } = row as MatchPublication & {
      training_sessions:
        | (TrainingSession & { teams?: Team | Team[] | null })
        | (TrainingSession & { teams?: Team | Team[] | null })[]
        | null;
    };
    const sessionSource = one(training_sessions);
    if (!sessionSource) {
      continue;
    }
    const { teams, ...session } = sessionSource;
    if (!isMatchKind(session.kind)) {
      continue;
    }
    rows.push({
      ...(session as TrainingSession),
      team: one(teams ?? null),
      publication: publication as MatchPublication,
      rosterCount: rosterCountBySession.get(session.id) ?? 0,
      registeredCount: registeredBySession.get(session.id) ?? 0,
    });
  }

  return filterDefaultAdminList(rows, Boolean(filters.includeDeleted)).sort((a, b) =>
    a.starts_at.localeCompare(b.starts_at),
  );
}

export async function probeMatchesForAdmin(
  filters: AdminMatchListFilters & { startsFrom: string; startsToExclusive: string },
): Promise<SessionWindowProbe> {
  const supabase = await createClient();
  const kinds = (filters.kinds ?? [])
    .map((value) => parseMatchKind(value))
    .filter((kind): kind is NonNullable<typeof kind> => kind !== null);
  const teamIds = (filters.teamIds ?? [])
    .map((value) => parseUuid(value))
    .filter((id): id is string => id !== null);

  const base = () => {
    let query = supabase
      .from("match_publications")
      .select("session_id, training_sessions!inner(starts_at)")
      .limit(1);
    if (kinds.length > 0) {
      query = query.in("training_sessions.kind", kinds);
    }
    if (teamIds.length > 0) {
      query = query.in("training_sessions.team_id", teamIds);
    }
    if (!filters.includeDeleted) {
      query = query.is("training_sessions.deleted_at", null);
    }
    return query;
  };

  const [earlier, later] = await Promise.all([
    base().lt("training_sessions.starts_at", filters.startsFrom),
    base().gte("training_sessions.starts_at", filters.startsToExclusive),
  ]);
  if (earlier.error) {
    console.error("probeMatchesForAdmin earlier", earlier.error.message);
  }
  if (later.error) {
    console.error("probeMatchesForAdmin later", later.error.message);
  }
  return {
    hasEarlier: (earlier.data ?? []).length > 0,
    hasLater: (later.data ?? []).length > 0,
  };
}

export async function getMatchForStaff(id: string): Promise<MatchAdminRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match_publications")
    .select("*, training_sessions(*, teams(*))")
    .eq("session_id", id)
    .maybeSingle();

  if (error) {
    console.error("getMatchForStaff", error.message);
    return null;
  }
  if (!data) {
    return null;
  }

  const { training_sessions, ...publication } = data as MatchPublication & {
    training_sessions:
      | (TrainingSession & { teams?: Team | Team[] | null })
      | (TrainingSession & { teams?: Team | Team[] | null })[]
      | null;
  };
  const sessionSource = one(training_sessions);
  if (!sessionSource) {
    return null;
  }
  const { teams, ...session } = sessionSource;

  const [rosterResult, countsResult] = await Promise.all([
    supabase.from("match_roster").select("session_id").eq("session_id", id),
    supabase.from("session_registrations").select("session_id, status").eq("session_id", id),
  ]);
  if (rosterResult.error) {
    console.error("getMatchForStaff roster", rosterResult.error.message);
  }
  if (countsResult.error) {
    console.error("getMatchForStaff registrations", countsResult.error.message);
  }

  return {
    ...(session as TrainingSession),
    team: one(teams ?? null),
    publication: publication as MatchPublication,
    rosterCount: rosterResult.data?.length ?? 0,
    registeredCount: tallyRegisteredCounts(countsResult.data ?? []).get(id) ?? 0,
  };
}

export type MatchRosterAdminRow = MatchRosterRow & {
  player: Player | null;
};

export async function listMatchRosterForStaff(sessionId: string): Promise<MatchRosterAdminRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match_roster")
    .select("*, players(*)")
    .eq("session_id", sessionId)
    .order("jersey_number");

  if (error) {
    console.error("listMatchRosterForStaff", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const { players, ...roster } = row as MatchRosterRow & {
      players: Player | Player[] | null;
    };
    return {
      ...(roster as MatchRosterRow),
      player: one(players),
    };
  });
}
