"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { todayInClubTimeZone, formatIsoDate, ageBandFromBirthDate, isTeamAgeBandAllowedForPlayer } from "@/lib/age-band";
import {
  isPlayersCjkNameCheckViolation,
  parseAgeBand,
  parseBirthDate,
  parseMembershipSlots,
  parseOrgStatus,
  parsePlayerNames,
  parseUuid,
  playerNamesError,
  readString,
  membershipWriteErrorKey,
  teamDeleteErrorKey,
} from "@/lib/org/parse";
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

  const name = readString(formData, "name");
  const ageBand = parseAgeBand(readString(formData, "age_band"));
  const status = parseOrgStatus(readString(formData, "status")) ?? "active";

  if (!name) {
    return fail("invalidName");
  }
  if (!ageBand) {
    return fail("invalidAgeBand");
  }

  const { error } = await actor.supabase.from("teams").insert({
    name,
    age_band: ageBand,
    status,
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

  const name = readString(formData, "name");
  const ageBand = parseAgeBand(readString(formData, "age_band"));
  const status = parseOrgStatus(readString(formData, "status"));

  if (!name) {
    return fail("invalidName");
  }
  if (!ageBand) {
    return fail("invalidAgeBand");
  }
  if (!status) {
    return fail("invalidStatus");
  }

  const { error } = await actor.supabase
    .from("teams")
    .update({
      name,
      age_band: ageBand,
      status,
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

async function setPlayerMemberships(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
  memberships: { teamId: string; jersey: number }[],
  birthDate: string,
): Promise<OrgErrorKey | null> {
  const teamIds = memberships.map((row) => row.teamId);
  const { data: teams, error: teamError } = await supabase
    .from("teams")
    .select("id, age_band")
    .in("id", teamIds);

  if (teamError) {
    console.error("setPlayerMemberships teams", teamError.message);
    return "generic";
  }
  if (!teams || teams.length !== teamIds.length) {
    return "teamNotFound";
  }

  const natural = ageBandFromBirthDate(birthDate);
  for (const membership of memberships) {
    const team = teams.find((row) => row.id === membership.teamId);
    if (!team) {
      return "teamNotFound";
    }
    if (!isTeamAgeBandAllowedForPlayer(natural, team.age_band)) {
      return "membershipBandNotAllowed";
    }
  }

  const { error } = await supabase.rpc("admin_set_player_memberships", {
    p_player_id: playerId,
    p_team_ids: teamIds,
    p_jersey_numbers: memberships.map((row) => row.jersey),
  });

  if (error) {
    console.error("setPlayerMemberships", error.message);
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

  return { ...names, birthDate, status };
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
      created_by: actor.user.id,
      updated_by: actor.user.id,
    })
    .select("id")
    .single();

  if (error || !player) {
    return fail(playerWriteError(error));
  }

  const membershipError = await setPlayerMemberships(
    actor.supabase,
    player.id,
    parsedMemberships.memberships,
    fields.birthDate as string,
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
      updated_by: actor.user.id,
    })
    .eq("id", playerId);

  if (error) {
    return fail(playerWriteError(error));
  }

  const membershipError = await setPlayerMemberships(
    actor.supabase,
    playerId,
    parsedMemberships.memberships,
    fields.birthDate as string,
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
