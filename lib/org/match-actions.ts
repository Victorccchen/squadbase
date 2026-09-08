"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import {
  parseOptionalBoundedText,
  parseRequiredBoundedText,
  parseUuid,
  readAllStrings,
  readString,
} from "@/lib/org/parse";
import {
  addMinutesToOffsetIso,
  isEndsAfterStart,
  MAX_SESSION_LOCATION,
  MAX_SESSION_NOTES,
  MAX_SESSION_TITLE,
  parseClubDateTimeLocal,
  parseDurationMinutes,
} from "@/lib/org/session-time";
import {
  DEFAULT_MATCH_DURATION_MINUTES,
  MAX_MATCH_RESULT_NOTE,
  matchRpcErrorKey,
  parseMatchKind,
  parseMatchOpponent,
  parseMatchScore,
  parseMatchSide,
  planBulkMatchCreates,
} from "@/lib/org/match";
import { type OrgActionState, type OrgErrorKey, type TeamCreateRowResult } from "@/lib/org/errors";
import { decideMultiTeamCreate, parseSelectedTeamIds } from "@/lib/org/multi-team-create";
import { isTeamKindAllowedForSessionKind } from "@/lib/org/squad-team";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

async function assertCompetitionTeamIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamIds: string[],
  kind: "cup" | "league" | "friendly",
): Promise<OrgErrorKey | null> {
  const { data, error } = await supabase.from("teams").select("id, kind").in("id", teamIds);
  if (error || !data || data.length !== teamIds.length) {
    return "teamNotFound";
  }
  if (data.some((row) => !isTeamKindAllowedForSessionKind(kind, row.kind))) {
    return "invalidTeamKind";
  }
  return null;
}

function ok(): OrgActionState {
  return { ok: true, errorKey: null };
}

function localeFromForm(formData: FormData) {
  return parseAppLocale(readString(formData, "locale"));
}

function revalidateMatches() {
  revalidatePath("/", "layout");
}

type AdminHref = "/app/admin/matches" | `/app/admin/matches/${string}`;

function redirectAdmin(href: AdminHref, formData: FormData) {
  redirect({ href, locale: localeFromForm(formData) });
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

function parseMatchSchedule(formData: FormData):
  | { ok: true; startsAt: string; endsAt: string }
  | { ok: false; errorKey: OrgErrorKey } {
  const startsAt = parseClubDateTimeLocal(readString(formData, "starts_at"));
  if (!startsAt) {
    return { ok: false, errorKey: "invalidSessionTime" };
  }

  const endsRaw = readString(formData, "ends_at");
  const durationRaw = readString(formData, "duration_minutes");
  let endsAt = endsRaw ? parseClubDateTimeLocal(endsRaw) : null;

  if (!endsAt && durationRaw) {
    const duration = parseDurationMinutes(durationRaw);
    if (!duration) {
      return { ok: false, errorKey: "invalidDuration" };
    }
    endsAt = addMinutesToOffsetIso(startsAt, duration);
  }

  if (!endsAt) {
    endsAt = addMinutesToOffsetIso(startsAt, DEFAULT_MATCH_DURATION_MINUTES);
  }

  if (!endsAt) {
    return { ok: false, errorKey: "invalidSessionTime" };
  }
  if (!isEndsAfterStart(startsAt, endsAt)) {
    return { ok: false, errorKey: "endsBeforeStart" };
  }
  return { ok: true, startsAt, endsAt };
}

export async function createMatch(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const teams = parseSelectedTeamIds(readAllStrings(formData, "team_id"));
  if (!teams.ok) {
    return fail(teams.errorKey);
  }

  const kind = parseMatchKind(readString(formData, "kind"));
  if (!kind) {
    return fail("matchKindRequired");
  }

  const kindError = await assertCompetitionTeamIds(actor.supabase, teams.teamIds, kind);
  if (kindError) {
    return fail(kindError);
  }

  const title = parseRequiredBoundedText(readString(formData, "title"), MAX_SESSION_TITLE);
  if (!title) {
    return fail("missingTitle");
  }

  const opponentParsed = parseMatchOpponent(readString(formData, "opponent"));
  if (!opponentParsed.ok) {
    return fail("invalidOpponent");
  }

  const side = parseMatchSide(readString(formData, "side")) ?? "home";

  const schedule = parseMatchSchedule(formData);
  if (!schedule.ok) {
    return fail(schedule.errorKey);
  }

  const location = parseOptionalBoundedText(
    readString(formData, "location"),
    MAX_SESSION_LOCATION,
  );
  const notes = parseOptionalBoundedText(readString(formData, "notes"), MAX_SESSION_NOTES);
  const isPlayoff = kind === "league" && readString(formData, "is_playoff") === "true";
  const isPublished = readString(formData, "is_published") === "true";

  const results: TeamCreateRowResult[] = [];
  for (const teamId of teams.teamIds) {
    const { data, error } = await actor.supabase.rpc("admin_create_match", {
      p_team_id: teamId,
      p_title: title,
      p_kind: kind,
      p_starts_at: schedule.startsAt,
      p_ends_at: schedule.endsAt,
      p_location: location,
      p_notes: notes,
      p_opponent: opponentParsed.opponent,
      p_side: side,
      p_is_playoff: isPlayoff,
      p_is_published: isPublished,
    });
    if (error || !data) {
      console.error("createMatch", teamId, error?.message);
      results.push({
        teamId,
        ok: false,
        errorKey: matchRpcErrorKey(error),
        createdId: null,
      });
    } else {
      results.push({ teamId, ok: true, errorKey: null, createdId: data });
    }
  }

  const decision = decideMultiTeamCreate({
    results,
    preferDetailWhenSingle: true,
  });
  if (results.some((row) => row.ok)) {
    revalidateMatches();
  }
  if (decision.action === "redirect") {
    if (decision.hrefKind === "detail" && decision.createdId) {
      redirectAdmin(`/app/admin/matches/${decision.createdId}`, formData);
    } else {
      redirectAdmin("/app/admin/matches", formData);
    }
    return ok();
  }
  return decision.state;
}

export async function updateMatch(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const title = parseRequiredBoundedText(readString(formData, "title"), MAX_SESSION_TITLE);
  if (!title) {
    return fail("missingTitle");
  }

  const opponentParsed = parseMatchOpponent(readString(formData, "opponent"));
  if (!opponentParsed.ok) {
    return fail("invalidOpponent");
  }

  const side = parseMatchSide(readString(formData, "side")) ?? "home";

  const schedule = parseMatchSchedule(formData);
  if (!schedule.ok) {
    return fail(schedule.errorKey);
  }

  const location = parseOptionalBoundedText(
    readString(formData, "location"),
    MAX_SESSION_LOCATION,
  );
  const notes = parseOptionalBoundedText(readString(formData, "notes"), MAX_SESSION_NOTES);
  const isPlayoff = readString(formData, "is_playoff") === "true";

  const { error } = await actor.supabase.rpc("admin_update_match", {
    p_session_id: sessionId,
    p_title: title,
    p_starts_at: schedule.startsAt,
    p_ends_at: schedule.endsAt,
    p_location: location,
    p_notes: notes,
    p_opponent: opponentParsed.opponent,
    p_side: side,
    p_is_playoff: isPlayoff,
  });

  if (error) {
    console.error("updateMatch", error.message);
    return fail(matchRpcErrorKey(error));
  }

  revalidateMatches();
  redirectAdmin(`/app/admin/matches/${sessionId}`, formData);
  return ok();
}

export async function attachMatchPublication(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const opponentParsed = parseMatchOpponent(readString(formData, "opponent"));
  if (!opponentParsed.ok) {
    return fail("invalidOpponent");
  }

  const side = parseMatchSide(readString(formData, "side")) ?? "home";

  const { error } = await actor.supabase.rpc("admin_upsert_match_publication", {
    p_session_id: sessionId,
    p_opponent: opponentParsed.opponent,
    p_side: side,
    p_is_published: false,
  });

  if (error) {
    console.error("attachMatchPublication", error.message);
    return fail(matchRpcErrorKey(error));
  }

  revalidateMatches();
  redirectAdmin(`/app/admin/matches/${sessionId}`, formData);
  return ok();
}

export async function createMatchesBulk(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const teams = parseSelectedTeamIds(readAllStrings(formData, "team_id"));
  if (!teams.ok) {
    return fail(teams.errorKey);
  }

  const kind = parseMatchKind(readString(formData, "kind"));
  if (!kind) {
    return fail("matchKindRequired");
  }

  const kindError = await assertCompetitionTeamIds(actor.supabase, teams.teamIds, kind);
  if (kindError) {
    return fail(kindError);
  }

  const title = parseRequiredBoundedText(readString(formData, "title"), MAX_SESSION_TITLE);
  if (!title) {
    return fail("missingTitle");
  }

  const opponentParsed = parseMatchOpponent(readString(formData, "opponent"));
  if (!opponentParsed.ok) {
    return fail("invalidOpponent");
  }

  const side = parseMatchSide(readString(formData, "side")) ?? "home";
  const planned = planBulkMatchCreates({
    kickoffLocals: readAllStrings(formData, "kickoffs"),
    durationMinutes: readString(formData, "duration_minutes"),
  });
  if (!planned.ok) {
    return fail(planned.errorKey);
  }

  const location = parseOptionalBoundedText(
    readString(formData, "location"),
    MAX_SESSION_LOCATION,
  );
  const notes = parseOptionalBoundedText(readString(formData, "notes"), MAX_SESSION_NOTES);
  const isPlayoff = kind === "league" && readString(formData, "is_playoff") === "true";
  const isPublished = readString(formData, "is_published") === "true";

  const results: TeamCreateRowResult[] = [];
  for (const teamId of teams.teamIds) {
    const { data, error } = await actor.supabase.rpc("admin_create_matches", {
      p_team_id: teamId,
      p_title: title,
      p_kind: kind,
      p_starts_at: planned.rows.map((row) => row.startsAt),
      p_ends_at: planned.rows.map((row) => row.endsAt),
      p_location: location,
      p_notes: notes,
      p_opponent: opponentParsed.opponent,
      p_side: side,
      p_is_playoff: isPlayoff,
      p_is_published: isPublished,
    });
    if (error || !data?.length) {
      console.error("createMatchesBulk", teamId, error?.message);
      results.push({
        teamId,
        ok: false,
        errorKey: matchRpcErrorKey(error),
        createdId: null,
      });
    } else {
      results.push({ teamId, ok: true, errorKey: null, createdId: data[0] ?? null });
    }
  }

  const decision = decideMultiTeamCreate({
    results,
    preferDetailWhenSingle: false,
  });
  if (results.some((row) => row.ok)) {
    revalidateMatches();
  }
  if (decision.action === "redirect") {
    redirectAdmin("/app/admin/matches", formData);
    return ok();
  }
  return decision.state;
}

export async function setMatchPublished(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const published = readString(formData, "is_published") === "true";
  const { error } = await actor.supabase.rpc("admin_set_match_published", {
    p_session_id: sessionId,
    p_is_published: published,
  });

  if (error) {
    console.error("setMatchPublished", error.message);
    return fail(matchRpcErrorKey(error));
  }

  revalidateMatches();
  redirectAdmin(`/app/admin/matches/${sessionId}`, formData);
  return ok();
}

export async function setMatchResult(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const clubScore = parseMatchScore(readString(formData, "club_score"));
  const opponentScore = parseMatchScore(readString(formData, "opponent_score"));
  if (clubScore === null || opponentScore === null) {
    return fail("invalidMatchScore");
  }

  const resultNote = parseOptionalBoundedText(
    readString(formData, "result_note"),
    MAX_MATCH_RESULT_NOTE,
  );

  const { error } = await actor.supabase.rpc("admin_set_match_result", {
    p_session_id: sessionId,
    p_club_score: clubScore,
    p_opponent_score: opponentScore,
    p_result_note: resultNote,
  });

  if (error) {
    console.error("setMatchResult", error.message);
    return fail(matchRpcErrorKey(error));
  }

  revalidateMatches();
  redirectAdmin(`/app/admin/matches/${sessionId}`, formData);
  return ok();
}

export async function cancelMatch(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const { error } = await actor.supabase.rpc("admin_cancel_match", {
    p_session_id: sessionId,
  });

  if (error) {
    console.error("cancelMatch", error.message);
    return fail(matchRpcErrorKey(error));
  }

  revalidateMatches();
  redirectAdmin(`/app/admin/matches/${sessionId}`, formData);
  return ok();
}

export async function restoreMatch(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const { error } = await actor.supabase.rpc("admin_restore_match", {
    p_session_id: sessionId,
  });

  if (error) {
    console.error("restoreMatch", error.message);
    return fail(matchRpcErrorKey(error));
  }

  revalidateMatches();
  redirectAdmin(`/app/admin/matches/${sessionId}`, formData);
  return ok();
}

export async function setMatchRoster(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const playerIds = readAllStrings(formData, "player_ids")
    .map((value) => parseUuid(value))
    .filter((id): id is string => id !== null);

  const { error } = await actor.supabase.rpc("admin_set_match_roster", {
    p_session_id: sessionId,
    p_player_ids: playerIds,
  });

  if (error) {
    console.error("setMatchRoster", error.message);
    return fail(matchRpcErrorKey(error));
  }

  revalidateMatches();
  redirectAdmin(`/app/admin/matches/${sessionId}`, formData);
  return ok();
}
