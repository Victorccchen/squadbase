"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { todayInClubTimeZone, formatIsoDate } from "@/lib/age-band";
import {
  isJerseyUniqueViolation,
  isPlayersCjkNameCheckViolation,
  parseAgeBand,
  parseBirthDate,
  parseJersey,
  parseOrgStatus,
  parsePlayerNames,
  parseUuid,
  playerNamesError,
  readString,
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

async function upsertMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
  teamId: string,
  jerseyNumber: number,
  actorId: string,
): Promise<OrgErrorKey | null> {
  const { data: existing, error: loadError } = await supabase
    .from("team_memberships")
    .select("id")
    .eq("player_id", playerId)
    .order("updated_at", { ascending: false });

  if (loadError) {
    console.error("upsertMembership load", loadError.message);
    return "generic";
  }

  const current = existing?.[0];
  const extras = (existing ?? []).slice(1);

  if (current) {
    const { error } = await supabase
      .from("team_memberships")
      .update({
        team_id: teamId,
        jersey_number: jerseyNumber,
        status: "active",
        updated_by: actorId,
      })
      .eq("id", current.id);

    if (error) {
      if (isJerseyUniqueViolation(error)) {
        return "jerseyTaken";
      }
      console.error("upsertMembership update", error.message);
      return "generic";
    }
  } else {
    const { error } = await supabase.from("team_memberships").insert({
      player_id: playerId,
      team_id: teamId,
      jersey_number: jerseyNumber,
      status: "active",
      created_by: actorId,
      updated_by: actorId,
    });

    if (error) {
      if (isJerseyUniqueViolation(error)) {
        return "jerseyTaken";
      }
      console.error("upsertMembership insert", error.message);
      return "generic";
    }
  }

  if (extras.length > 0) {
    const { error } = await supabase
      .from("team_memberships")
      .delete()
      .in(
        "id",
        extras.map((row) => row.id),
      );
    if (error) {
      console.error("upsertMembership extras", error.message);
    }
  }

  return null;
}

function playerFields(formData: FormData) {
  const names = parsePlayerNames(formData);
  const birthRaw = readString(formData, "birth_date");
  const today = formatIsoDate(todayInClubTimeZone());
  const birthDate = parseBirthDate(birthRaw, today);
  const status = parseOrgStatus(readString(formData, "status")) ?? "active";
  const teamId = readString(formData, "team_id");
  const jersey = parseJersey(readString(formData, "jersey_number"));

  return { ...names, birthDate, status, teamId, jersey };
}

function validatePlayerFields(fields: ReturnType<typeof playerFields>): OrgErrorKey | null {
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
  if (!fields.teamId) {
    return "missingTeam";
  }
  if (fields.jersey === null) {
    return "invalidJersey";
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

  const fields = playerFields(formData);
  const invalid = validatePlayerFields(fields);
  if (invalid) {
    return fail(invalid);
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

  const membershipError = await upsertMembership(
    actor.supabase,
    player.id,
    fields.teamId,
    fields.jersey as number,
    actor.user.id,
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

  const fields = playerFields(formData);
  const invalid = validatePlayerFields(fields);
  if (invalid) {
    return fail(invalid);
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

  const membershipError = await upsertMembership(
    actor.supabase,
    playerId,
    fields.teamId,
    fields.jersey as number,
    actor.user.id,
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
