"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { todayInClubTimeZone, formatIsoDate, ageBandFromBirthDate, birthAgeLabelFromBirthDate } from "@/lib/age-band";
import {
  isPlayersCjkNameCheckViolation,
  parseAgeBand,
  parseAgeSquadSlot,
  parseBirthDate,
  parseContinuesTraining,
  parseEligibleBirthAges,
  parseLayerKey,
  parseMembershipSlots,
  parseOrgStatus,
  parsePlayerNames,
  parseTeamKind,
  parseUuid,
  playerNamesError,
  readString,
  readAllStrings,
  membershipWriteErrorKey,
  jerseyNumberTakenOnTeam,
  teamDeleteErrorKey,
} from "@/lib/org/parse";
import {
  ageBandFromLayerKey,
  competitionMembershipDecision,
  isAgeSquadAllowedForPlayer,
  isCompetitionTeam,
  isAgeSquad,
} from "@/lib/org/squad-team";
import type { AgeBand } from "@/lib/supabase/database.types";
import { type OrgActionState, type OrgErrorKey } from "@/lib/org/errors";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

function ok(): OrgActionState {
  return { ok: true, errorKey: null };
}

type AdminClient = Awaited<ReturnType<typeof createClient>>;
type AuthUser = Awaited<ReturnType<typeof loadSignedInAccount>>["user"];
type AdminActorResult =
  | { ok: true; user: AuthUser; supabase: AdminClient }
  | { ok: false; errorKey: "notConfigured" | "forbidden" };

async function requireAdminActor(): Promise<AdminActorResult> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false, errorKey: "notConfigured" };
  }

  const { user, roles } = await loadSignedInAccount();
  if (!canAccessAdmin(roles)) {
    return { ok: false, errorKey: "forbidden" };
  }

  const supabase = await createClient();
  return { ok: true, user, supabase };
}

function revalidateOrg() {
  revalidatePath("/", "layout");
}

type AdminHref =
  | "/app/admin/teams"
  | "/app/admin/players"
  | "/app/admin/coaches"
  | `/app/admin/teams/${string}`
  | `/app/admin/players/${string}`
  | `/app/admin/coaches/${string}`;

function localeFromForm(formData: FormData) {
  return parseAppLocale(readString(formData, "locale"));
}

// Do not call getLocale() here: next-intl reads next/root-params, which Server Actions cannot use.
function redirectAdmin(href: AdminHref, formData: FormData) {
  redirect({ href, locale: localeFromForm(formData) });
}

export async function createTeam(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const parsed = parseTeamFields(formData);
  if (!parsed.ok) {
    return fail(parsed.errorKey);
  }

  const { error } = await actor.supabase.from("teams").insert({
    name: parsed.name,
    age_band: parsed.ageBand,
    kind: parsed.kind,
    layer_key: parsed.layerKey,
    eligible_birth_ages: parsed.eligibleBirthAges,
    status: parsed.status,
    created_by: actor.user.id,
    updated_by: actor.user.id,
  });

  if (error) {
    console.error("createTeam", error.message);
    return fail("generic");
  }

  revalidateOrg();
  redirectAdmin("/app/admin/teams", formData);
  return ok();
}

export async function updateTeam(
  teamId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const parsed = parseTeamFields(formData);
  if (!parsed.ok) {
    return fail(parsed.errorKey);
  }

  const { error } = await actor.supabase
    .from("teams")
    .update({
      name: parsed.name,
      age_band: parsed.ageBand,
      kind: parsed.kind,
      layer_key: parsed.layerKey,
      eligible_birth_ages: parsed.eligibleBirthAges,
      status: parsed.status,
      updated_by: actor.user.id,
    })
    .eq("id", teamId);

  if (error) {
    console.error("updateTeam", error.message);
    return fail("generic");
  }

  revalidateOrg();
  redirectAdmin(`/app/admin/teams/${teamId}`, formData);
  return ok();
}

type ParsedTeamFields =
  | {
      ok: true;
      name: string;
      kind: "age_squad" | "competition_team";
      ageBand: AgeBand;
      layerKey: string | null;
      eligibleBirthAges: string[] | null;
      status: "active" | "inactive";
    }
  | { ok: false; errorKey: OrgErrorKey };

function parseTeamFields(formData: FormData): ParsedTeamFields {
  const name = readString(formData, "name");
  const kind = parseTeamKind(readString(formData, "kind")) ?? "age_squad";
  const status = parseOrgStatus(readString(formData, "status")) ?? "active";
  if (!name) {
    return { ok: false, errorKey: "invalidName" };
  }

  if (kind === "age_squad") {
    const ageBand = parseAgeBand(readString(formData, "age_band"));
    if (!ageBand) {
      return { ok: false, errorKey: "invalidAgeBand" };
    }
    return {
      ok: true,
      name,
      kind,
      ageBand,
      layerKey: null,
      eligibleBirthAges: null,
      status,
    };
  }

  const layerKey = parseLayerKey(readString(formData, "layer_key"));
  if (!layerKey) {
    return { ok: false, errorKey: "invalidLayerKey" };
  }
  const eligible = parseEligibleBirthAges(readAllStrings(formData, "eligible_birth_ages"));
  if (eligible.length === 0) {
    return { ok: false, errorKey: "missingEligibleBirthAges" };
  }
  const ageBand = parseAgeBand(readString(formData, "age_band")) ?? ageBandFromLayerKey(layerKey);
  return {
    ok: true,
    name,
    kind,
    ageBand,
    layerKey,
    eligibleBirthAges: eligible,
    status,
  };
}

export async function setTeamStatus(
  teamId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const status = parseOrgStatus(readString(formData, "status"));
  if (!status) {
    return fail("invalidStatus");
  }

  const { data, error } = await actor.supabase
    .from("teams")
    .update({
      status,
      updated_by: actor.user.id,
    })
    .eq("id", teamId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("setTeamStatus", error.message);
    return fail("generic");
  }
  if (!data) {
    return fail("teamNotFound");
  }

  revalidateOrg();
  if (readString(formData, "next") === "teams") {
    redirectAdmin("/app/admin/teams", formData);
  } else {
    redirectAdmin(`/app/admin/teams/${teamId}`, formData);
  }
  return ok();
}

export async function deleteTeam(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const teamId = parseUuid(readString(formData, "team_id"));
  if (!teamId) {
    return fail("generic");
  }

  const { error } = await actor.supabase.rpc("admin_delete_team", {
    p_team_id: teamId,
  });

  if (error) {
    console.error("deleteTeam", error.message);
    return fail(teamDeleteErrorKey(error));
  }

  revalidateOrg();
  redirectAdmin("/app/admin/teams", formData);
  return ok();
}

async function setPlayerAssignments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
  ageSquad: { teamId: string; jersey: number },
  memberships: { teamId: string; jersey: number }[],
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

function playerIdentityFields(formData: FormData) {
  const names = parsePlayerNames(formData);
  const birthRaw = readString(formData, "birth_date");
  const today = formatIsoDate(todayInClubTimeZone());
  const birthDate = parseBirthDate(birthRaw, today);
  const status = parseOrgStatus(readString(formData, "status")) ?? "active";
  const continuesTraining = parseContinuesTraining(formData);

  return { ...names, birthDate, status, continuesTraining };
}

function validatePlayerIdentity(
  fields: ReturnType<typeof playerIdentityFields>,
): OrgErrorKey | null {
  const nameError = playerNamesError(fields);
  if (nameError) {
    return nameError;
  }
  if (fields.birthDate === "future") {
    return "futureBirthDate";
  }
  if (!fields.birthDate) {
    return "invalidBirthDate";
  }
  return null;
}

function playerWriteError(error: { code?: string; message?: string; details?: string } | null): OrgErrorKey {
  if (isPlayersCjkNameCheckViolation(error)) {
    return "missingCjkName";
  }
  if (error) {
    console.error("playerWrite", error.message);
  }
  return "generic";
}

export async function createPlayer(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const fields = playerIdentityFields(formData);
  const invalid = validatePlayerIdentity(fields);
  if (invalid) {
    return fail(invalid);
  }

  const parsedSquad = parseAgeSquadSlot(formData);
  if (!parsedSquad.ok) {
    return fail(parsedSquad.errorKey);
  }

  const parsedMemberships = parseMembershipSlots(formData);
  if (!parsedMemberships.ok) {
    return fail(parsedMemberships.errorKey);
  }

  const { data: player, error } = await actor.supabase
    .from("players")
    .insert({
      name_zh: fields.nameZh,
      name_en_given: fields.nameEnGiven,
      name_en_family: fields.nameEnFamily,
      name_ja: fields.nameJa,
      birth_date: fields.birthDate as string,
      status: fields.status,
      continues_training: fields.continuesTraining,
      created_by: actor.user.id,
      updated_by: actor.user.id,
    })
    .select("id")
    .single();

  if (error || !player) {
    return fail(playerWriteError(error));
  }

  const membershipError = await setPlayerAssignments(
    actor.supabase,
    player.id,
    parsedSquad.squad,
    parsedMemberships.memberships,
    fields.birthDate as string,
    fields.continuesTraining,
  );

  if (membershipError) {
    await actor.supabase.from("players").delete().eq("id", player.id);
    return fail(membershipError);
  }

  revalidateOrg();
  redirectAdmin("/app/admin/players", formData);
  return ok();
}

export async function updatePlayer(
  playerId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const fields = playerIdentityFields(formData);
  const invalid = validatePlayerIdentity(fields);
  if (invalid) {
    return fail(invalid);
  }

  const parsedSquad = parseAgeSquadSlot(formData);
  if (!parsedSquad.ok) {
    return fail(parsedSquad.errorKey);
  }

  const parsedMemberships = parseMembershipSlots(formData);
  if (!parsedMemberships.ok) {
    return fail(parsedMemberships.errorKey);
  }

  const { error } = await actor.supabase
    .from("players")
    .update({
      name_zh: fields.nameZh,
      name_en_given: fields.nameEnGiven,
      name_en_family: fields.nameEnFamily,
      name_ja: fields.nameJa,
      birth_date: fields.birthDate as string,
      status: fields.status,
      continues_training: fields.continuesTraining,
      updated_by: actor.user.id,
    })
    .eq("id", playerId);

  if (error) {
    return fail(playerWriteError(error));
  }

  const membershipError = await setPlayerAssignments(
    actor.supabase,
    playerId,
    parsedSquad.squad,
    parsedMemberships.memberships,
    fields.birthDate as string,
    fields.continuesTraining,
  );

  if (membershipError) {
    return fail(membershipError);
  }

  revalidateOrg();
  redirectAdmin(`/app/admin/players/${playerId}`, formData);
  return ok();
}

export async function linkCoach(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const profileId = readString(formData, "profile_id");
  if (!profileId) {
    return fail("profileRequired");
  }

  const { data, error } = await actor.supabase.rpc("admin_link_coach", {
    target_profile_id: profileId,
  });

  if (error || !data) {
    console.error("linkCoach", error?.message);
    return fail("generic");
  }

  revalidateOrg();
  redirectAdmin(`/app/admin/coaches/${data}`, formData);
  return ok();
}

export async function updateCoachStatus(
  coachId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const status = parseOrgStatus(readString(formData, "status"));
  if (!status) {
    return fail("invalidStatus");
  }

  const { error } = await actor.supabase
    .from("coaches")
    .update({ status, updated_by: actor.user.id })
    .eq("id", coachId);

  if (error) {
    console.error("updateCoachStatus", error.message);
    return fail("generic");
  }

  revalidateOrg();
  redirectAdmin(`/app/admin/coaches/${coachId}`, formData);
  return ok();
}

export async function assignCoachTeam(
  coachId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const teamId = readString(formData, "team_id");
  if (!teamId) {
    return fail("missingTeam");
  }

  const { error } = await actor.supabase.from("coach_team_assignments").insert({
    coach_id: coachId,
    team_id: teamId,
    created_by: actor.user.id,
    updated_by: actor.user.id,
  });

  if (error && error.code !== "23505") {
    console.error("assignCoachTeam", error.message);
    return fail("generic");
  }

  revalidateOrg();
  redirectAdmin(`/app/admin/coaches/${coachId}`, formData);
  return ok();
}

export async function unassignCoachTeam(formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return;
  }

  const assignmentId = readString(formData, "assignment_id");
  const coachId = readString(formData, "coach_id");
  if (!assignmentId) {
    return;
  }

  const { error } = await actor.supabase
    .from("coach_team_assignments")
    .delete()
    .eq("id", assignmentId);

  if (error) {
    console.error("unassignCoachTeam", error.message);
    return;
  }

  revalidateOrg();
  if (coachId) {
    redirectAdmin(`/app/admin/coaches/${coachId}`, formData);
  }
}
