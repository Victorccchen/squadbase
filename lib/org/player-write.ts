import { ageBandFromBirthDate, birthAgeLabelFromBirthDate } from "../age-band.ts";
import { createClient } from "../supabase/server.ts";
import type { OrgErrorKey } from "./errors.ts";
import {
  isPlayersCjkNameCheckViolation,
  jerseyNumberTakenOnTeam,
  membershipWriteErrorKey,
} from "./parse.ts";
import {
  competitionMembershipDecision,
  isAgeSquad,
  isAgeSquadAllowedForPlayer,
  isCompetitionTeam,
} from "./squad-team.ts";

export type PlayerWriteClient = Awaited<ReturnType<typeof createClient>>;

export type PlayerIdentityWrite = {
  nameZh: string | null;
  nameEnGiven: string;
  nameEnFamily: string;
  nameJa: string | null;
  birthDate: string;
  status: "active" | "inactive";
  continuesTraining: boolean;
};

export type MembershipSlot = {
  teamId: string;
  jersey: number;
};

export async function setPlayerAssignments(
  supabase: PlayerWriteClient,
  playerId: string,
  ageSquad: MembershipSlot,
  memberships: MembershipSlot[],
  birthDate: string,
  continuesTraining: boolean,
): Promise<OrgErrorKey | null> {
  const squadIds = [ageSquad.teamId];
  const teamIds = memberships.map((row) => row.teamId);
  const { data: units, error: teamError } = await supabase
    .from("teams")
    .select("id, age_band, kind, layer_key, eligible_birth_ages")
    .in("id", [...squadIds, ...teamIds]);

  if (teamError) {
    console.error("setPlayerAssignments teams", teamError.message);
    return "generic";
  }

  const squad = units?.find((row) => row.id === ageSquad.teamId);
  if (!squad || !isAgeSquad(squad)) {
    return "missingAgeSquad";
  }
  const naturalSquad = ageBandFromBirthDate(birthDate);
  if (!isAgeSquadAllowedForPlayer(naturalSquad, squad.age_band)) {
    return "membershipBandNotAllowed";
  }

  const birthAge = birthAgeLabelFromBirthDate(birthDate);
  const competitionUnits = (units ?? []).filter((row) => teamIds.includes(row.id));
  if (competitionUnits.length !== teamIds.length) {
    return "teamNotFound";
  }
  const { data: existingRows, error: existingError } = await supabase
    .from("team_memberships")
    .select("team_id")
    .eq("player_id", playerId)
    .eq("status", "active");
  if (existingError) {
    console.error("setPlayerAssignments existing", existingError.message);
    return "generic";
  }
  const existingIds = new Set((existingRows ?? []).map((row) => row.team_id));
  for (const membership of memberships) {
    const team = competitionUnits.find((row) => row.id === membership.teamId);
    if (!team || !isCompetitionTeam(team)) {
      return "invalidTeamKind";
    }
    const decision = competitionMembershipDecision({
      birthAge,
      continuesTraining,
      team,
      otherActiveTeams: competitionUnits.filter((row) => row.id !== team.id),
      isExistingMembership: existingIds.has(team.id),
    });
    if (!decision.ok) {
      return decision.errorKey;
    }
  }

  const slots = [ageSquad, ...memberships];
  const { data: jerseyHolders, error: jerseyError } = await supabase
    .from("team_memberships")
    .select("player_id, team_id, jersey_number")
    .in(
      "team_id",
      slots.map((row) => row.teamId),
    );
  if (jerseyError) {
    console.error("setPlayerAssignments jersey holders", jerseyError.message);
    return "generic";
  }
  for (const slot of slots) {
    if (
      jerseyNumberTakenOnTeam({
        playerId,
        teamId: slot.teamId,
        jersey: slot.jersey,
        holders: jerseyHolders ?? [],
      })
    ) {
      return "jerseyTaken";
    }
  }

  const { error: squadError } = await supabase.rpc("admin_set_player_age_squad", {
    p_player_id: playerId,
    p_squad_id: ageSquad.teamId,
    p_jersey_number: ageSquad.jersey,
  });
  if (squadError) {
    console.error("setPlayerAssignments age squad", squadError.message);
    return membershipWriteErrorKey(squadError);
  }

  const { error } = await supabase.rpc("admin_set_player_competition_teams", {
    p_player_id: playerId,
    p_team_ids: teamIds,
    p_jersey_numbers: memberships.map((row) => row.jersey),
  });

  if (error) {
    console.error("setPlayerAssignments competition", error.message);
    return membershipWriteErrorKey(error);
  }

  return null;
}

export async function insertPlayerWithAssignments(
  supabase: PlayerWriteClient,
  actorUserId: string,
  identity: PlayerIdentityWrite,
  ageSquad: MembershipSlot,
  memberships: MembershipSlot[],
): Promise<{ ok: true; id: string } | { ok: false; errorKey: OrgErrorKey }> {
  const { data: player, error } = await supabase
    .from("players")
    .insert({
      name_zh: identity.nameZh,
      name_en_given: identity.nameEnGiven,
      name_en_family: identity.nameEnFamily,
      name_ja: identity.nameJa,
      birth_date: identity.birthDate,
      status: identity.status,
      continues_training: identity.continuesTraining,
      created_by: actorUserId,
      updated_by: actorUserId,
    })
    .select("id")
    .single();

  if (error || !player) {
    if (isPlayersCjkNameCheckViolation(error)) {
      return { ok: false, errorKey: "missingCjkName" };
    }
    if (error) {
      console.error("playerWrite", error.message);
    }
    return { ok: false, errorKey: "generic" };
  }

  const membershipError = await setPlayerAssignments(
    supabase,
    player.id,
    ageSquad,
    memberships,
    identity.birthDate,
    identity.continuesTraining,
  );

  if (membershipError) {
    await supabase.from("players").delete().eq("id", player.id);
    return { ok: false, errorKey: membershipError };
  }

  return { ok: true, id: player.id };
}
