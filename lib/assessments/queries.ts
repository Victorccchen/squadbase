import { createClient } from "@/lib/supabase/server";
import { parseStoredSituations, parseStoredTraits } from "@/lib/assessments/parse";
import type { PlayerAssessment } from "@/lib/supabase/database.types";

function mapAssessmentRow(row: PlayerAssessment): PlayerAssessment | null {
  const situations = parseStoredSituations(row.situations);
  const traits = parseStoredTraits(row.traits);
  if (!situations || !traits) {
    console.error("listPlayerAssessments: invalid JSONB payload", row.id);
    return null;
  }
  return {
    ...row,
    situations,
    traits,
  };
}

export async function listPlayerAssessments(
  playerId: string,
): Promise<PlayerAssessment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("player_assessments")
    .select("*")
    .eq("player_id", playerId)
    .order("assessed_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listPlayerAssessments", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => mapAssessmentRow(row))
    .filter((row): row is PlayerAssessment => row !== null);
}

export async function getPlayerAssessment(
  playerId: string,
  assessmentId: string,
): Promise<PlayerAssessment | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("player_assessments")
    .select("*")
    .eq("id", assessmentId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) {
    console.error("getPlayerAssessment", error.message);
    return null;
  }
  if (!data) {
    return null;
  }
  return mapAssessmentRow(data);
}

export async function listLatestAssessmentsByPlayerId(
  playerIds: string[],
): Promise<Map<string, PlayerAssessment>> {
  const latest = new Map<string, PlayerAssessment>();
  if (playerIds.length === 0) {
    return latest;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("player_assessments")
    .select("*")
    .in("player_id", playerIds)
    .order("assessed_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listLatestAssessmentsByPlayerId", error.message);
    return latest;
  }

  for (const row of data ?? []) {
    if (latest.has(row.player_id)) {
      continue;
    }
    const mapped = mapAssessmentRow(row);
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
