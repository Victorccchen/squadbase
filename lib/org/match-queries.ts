import { createClient } from "@/lib/supabase/server";
import { getPublicSupabaseEnv } from "@/lib/env";
import { partitionPublicMatches } from "@/lib/org/match";
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

export async function listMatchesForAdmin(): Promise<MatchAdminRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match_publications")
    .select("*, training_sessions(*, teams(*))")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listMatchesForAdmin", error.message);
    return [];
  }

  const sessionIds = (data ?? []).map((row) => row.session_id);
  const rosterCountBySession = new Map<string, number>();
  if (sessionIds.length > 0) {
    const rosterResult = await supabase
      .from("match_roster")
      .select("session_id")
      .in("session_id", sessionIds);
    if (rosterResult.error) {
      console.error("listMatchesForAdmin roster", rosterResult.error.message);
    }
    for (const row of rosterResult.data ?? []) {
      rosterCountBySession.set(
        row.session_id,
        (rosterCountBySession.get(row.session_id) ?? 0) + 1,
      );
    }
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
    rows.push({
      ...(session as TrainingSession),
      team: one(teams ?? null),
      publication: publication as MatchPublication,
      rosterCount: rosterCountBySession.get(session.id) ?? 0,
    });
  }

  return rows.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
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

  const rosterResult = await supabase
    .from("match_roster")
    .select("session_id")
    .eq("session_id", id);

  return {
    ...(session as TrainingSession),
    team: one(teams ?? null),
    publication: publication as MatchPublication,
    rosterCount: rosterResult.data?.length ?? 0,
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
