import { createClient } from "@/lib/supabase/server";
import { parseStoredDimensionScore } from "@/lib/assessments/parse";
import { clubDateFromTimestamp } from "@/lib/assessments/model";
import type {
  AssessmentEvent,
  AssessmentEventWithScores,
  AssessmentScore,
  TrainingSession,
} from "@/lib/supabase/database.types";

type AssessmentEventRow = AssessmentEvent & {
  assessment_scores?: AssessmentScore[] | null;
};

export type AssessmentLinkSession = Pick<
  TrainingSession,
  "id" | "title" | "kind" | "starts_at" | "team_id"
> & {
  team_name: string | null;
};

function mapEventRow(row: AssessmentEventRow): AssessmentEventWithScores | null {
  const scores: AssessmentScore[] = [];
  for (const raw of row.assessment_scores ?? []) {
    const parsed = parseStoredDimensionScore(raw);
    if (!parsed) {
      continue;
    }
    scores.push({
      id: raw.id,
      event_id: row.id,
      dimension_kind: parsed.dimension_kind,
      dimension_code: parsed.dimension_code,
      score: parsed.score,
    });
  }

  if (scores.length === 0) {
    console.error("listAssessmentEvents: event has no valid scores", row.id);
    return null;
  }

  return {
    id: row.id,
    player_id: row.player_id,
    assessed_at: row.assessed_at,
    assessor_user_id: row.assessor_user_id,
    note: row.note,
    session_id: row.session_id,
    source_assessment_id: row.source_assessment_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    scores,
  };
}

export function eventClubDate(event: Pick<AssessmentEvent, "assessed_at">): string {
  return clubDateFromTimestamp(event.assessed_at);
}

export async function listPlayerAssessmentEvents(
  playerId: string,
): Promise<AssessmentEventWithScores[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessment_events")
    .select("*, assessment_scores(*)")
    .eq("player_id", playerId)
    .order("assessed_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listPlayerAssessmentEvents", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => mapEventRow(row as AssessmentEventRow))
    .filter((row): row is AssessmentEventWithScores => row !== null);
}

export async function getPlayerAssessmentEvent(
  playerId: string,
  eventId: string,
): Promise<AssessmentEventWithScores | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessment_events")
    .select("*, assessment_scores(*)")
    .eq("id", eventId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) {
    console.error("getPlayerAssessmentEvent", error.message);
    return null;
  }
  if (!data) {
    return null;
  }
  return mapEventRow(data as AssessmentEventRow);
}

export async function listLatestAssessmentEventsByPlayerId(
  playerIds: string[],
): Promise<Map<string, AssessmentEventWithScores>> {
  const latest = new Map<string, AssessmentEventWithScores>();
  if (playerIds.length === 0) {
    return latest;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessment_events")
    .select("*, assessment_scores(*)")
    .in("player_id", playerIds)
    .order("assessed_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listLatestAssessmentEventsByPlayerId", error.message);
    return latest;
  }

  for (const row of data ?? []) {
    if (latest.has(row.player_id)) {
      continue;
    }
    const mapped = mapEventRow(row as AssessmentEventRow);
    if (mapped) {
      latest.set(row.player_id, mapped);
    }
  }

  return latest;
}

export async function staffCanWritePlayerAssessment(
  playerId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_can_write_player_assessment", {
    p_player_id: playerId,
  });

  if (error) {
    console.error("staffCanWritePlayerAssessment", error.message);
    return false;
  }

  return data === true;
}

export async function listLinkableSessionsForPlayer(
  playerId: string,
): Promise<AssessmentLinkSession[]> {
  const supabase = await createClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("team_memberships")
    .select("team_id")
    .eq("player_id", playerId);

  if (membershipError) {
    console.error("listLinkableSessionsForPlayer memberships", membershipError.message);
    return [];
  }

  const teamIds = [...new Set((memberships ?? []).map((row) => row.team_id))];
  if (teamIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("training_sessions")
    .select("id, title, kind, starts_at, team_id, teams(name)")
    .in("team_id", teamIds)
    .is("deleted_at", null)
    .order("starts_at", { ascending: false })
    .limit(80);

  if (error) {
    console.error("listLinkableSessionsForPlayer sessions", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const team = row.teams as { name: string } | { name: string }[] | null;
    const teamName = Array.isArray(team) ? team[0]?.name ?? null : team?.name ?? null;
    return {
      id: row.id,
      title: row.title,
      kind: row.kind,
      starts_at: row.starts_at,
      team_id: row.team_id,
      team_name: teamName,
    };
  });
}
