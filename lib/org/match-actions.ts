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
  defaultMatchDurationMinutes,
  MAX_MATCH_RESULT_NOTE,
  isMissingRpcFunction,
  matchRpcErrorKey,
  parseMatchKind,
  parseMatchOpponent,
  parseMatchScore,
  parseMatchSide,
  planBulkMatchCreates,
} from "@/lib/org/match";
import { type OrgActionState, type OrgErrorKey, type TeamCreateRowResult } from "@/lib/org/errors";
import { decideMultiTeamCreate, parseSelectedTeamIds } from "@/lib/org/multi-team-create";
import { planSoftDeleteMatch } from "@/lib/org/soft-delete";
import { isTeamKindAllowedForSessionKind } from "@/lib/org/squad-team";
import { notifySiteMatchesChanged } from "@/lib/site/revalidate-notify";
import { parseMatchListingForm } from "@/lib/org/match-listing";
import {
  BROADCAST_FIELDS,
  checkYouTubeEmbed,
  combineEmbedStatuses,
  parseBroadcastForm,
  pickVideoTitle,
  type MatchBroadcastCheck,
} from "@/lib/org/youtube";
import type { MatchEmbedCheckStatus } from "@/lib/supabase/database.types";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

/** Checks the teams and returns each team's default match length (150 for senior/reserve). */
async function assertCompetitionTeamIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamIds: string[],
  kind: "cup" | "league" | "friendly",
): Promise<{ ok: true; defaultDurations: Map<string, number> } | { ok: false; errorKey: OrgErrorKey }> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, kind, age_band")
    .in("id", teamIds);
  if (error || !data || data.length !== teamIds.length) {
    return { ok: false, errorKey: "teamNotFound" };
  }
  if (data.some((row) => !isTeamKindAllowedForSessionKind(kind, row.kind))) {
    return { ok: false, errorKey: "invalidTeamKind" };
  }
  return {
    ok: true,
    defaultDurations: new Map(
      data.map((row) => [row.id, defaultMatchDurationMinutes(row.age_band)]),
    ),
  };
}

function ok(): OrgActionState {
  return { ok: true, errorKey: null };
}

function localeFromForm(formData: FormData) {
  return parseAppLocale(readString(formData, "locale"));
}

/**
 * Refreshes Squadbase pages and, after the response, tells the official site
 * which match caches to drop (no-op unless SITE_REVALIDATE_* is set).
 */
function revalidateMatches(matchIds: readonly string[], options: { roster?: boolean } = {}) {
  revalidatePath("/", "layout");
  notifySiteMatchesChanged(matchIds, options);
}

function createdMatchIds(results: readonly TeamCreateRowResult[]): string[] {
  return results.flatMap((row) => (row.ok && row.createdId ? [row.createdId] : []));
}

async function loadSessionTeamAgeBand(
  supabase: AdminClient,
  sessionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("training_sessions")
    .select("teams(age_band)")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const teams = (data as { teams?: { age_band: string } | { age_band: string }[] | null }).teams;
  const team = Array.isArray(teams) ? teams[0] : teams;
  return team?.age_band ?? null;
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

function parseMatchSchedule(
  formData: FormData,
  defaultDurationMinutes: number = DEFAULT_MATCH_DURATION_MINUTES,
):
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
    endsAt = addMinutesToOffsetIso(startsAt, defaultDurationMinutes);
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

  const teamCheck = await assertCompetitionTeamIds(actor.supabase, teams.teamIds, kind);
  if (!teamCheck.ok) {
    return fail(teamCheck.errorKey);
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

  // Validate once with the youth default; each team gets its own default below.
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
    const teamSchedule = parseMatchSchedule(
      formData,
      teamCheck.defaultDurations.get(teamId) ?? DEFAULT_MATCH_DURATION_MINUTES,
    );
    if (!teamSchedule.ok) {
      results.push({ teamId, ok: false, errorKey: teamSchedule.errorKey, createdId: null });
      continue;
    }
    const { data, error } = await actor.supabase.rpc("admin_create_match", {
      p_team_id: teamId,
      p_title: title,
      p_kind: kind,
      p_starts_at: teamSchedule.startsAt,
      p_ends_at: teamSchedule.endsAt,
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
    revalidateMatches(createdMatchIds(results));
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

  const schedule = parseMatchSchedule(
    formData,
    defaultMatchDurationMinutes(await loadSessionTeamAgeBand(actor.supabase, sessionId)),
  );
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

  revalidateMatches([sessionId]);
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

  revalidateMatches([sessionId]);
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

  const teamCheck = await assertCompetitionTeamIds(actor.supabase, teams.teamIds, kind);
  if (!teamCheck.ok) {
    return fail(teamCheck.errorKey);
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

  const bulkCreatedIds: string[] = [];
  const results: TeamCreateRowResult[] = [];
  for (const teamId of teams.teamIds) {
    const teamPlan = planBulkMatchCreates({
      kickoffLocals: readAllStrings(formData, "kickoffs"),
      durationMinutes: readString(formData, "duration_minutes"),
      defaultDurationMinutes: teamCheck.defaultDurations.get(teamId),
    });
    if (!teamPlan.ok) {
      results.push({ teamId, ok: false, errorKey: teamPlan.errorKey, createdId: null });
      continue;
    }
    const { data, error } = await actor.supabase.rpc("admin_create_matches", {
      p_team_id: teamId,
      p_title: title,
      p_kind: kind,
      p_starts_at: teamPlan.rows.map((row) => row.startsAt),
      p_ends_at: teamPlan.rows.map((row) => row.endsAt),
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
      bulkCreatedIds.push(...data);
    }
  }

  const decision = decideMultiTeamCreate({
    results,
    preferDetailWhenSingle: false,
  });
  if (results.some((row) => row.ok)) {
    revalidateMatches(bulkCreatedIds);
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

  revalidateMatches([sessionId]);
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

  revalidateMatches([sessionId]);
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

  revalidateMatches([sessionId]);
  redirectAdmin(`/app/admin/matches/${sessionId}`, formData);
  return ok();
}

export async function postponeMatch(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const { error } = await actor.supabase.rpc("admin_postpone_match", {
    p_session_id: sessionId,
  });

  if (error) {
    console.error("postponeMatch", error.message);
    return fail(matchRpcErrorKey(error));
  }

  revalidateMatches([sessionId]);
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

  revalidateMatches([sessionId]);
  redirectAdmin(`/app/admin/matches/${sessionId}`, formData);
  return ok();
}

export async function softDeleteMatch(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const planned = planSoftDeleteMatch({
    configured: true,
    roles: ["admin"],
    sessionId: parseUuid(sessionId) ?? readString(formData, "session_id"),
  });
  if (!planned.ok) {
    return fail(planned.errorKey);
  }

  const rpc = await actor.supabase.rpc("admin_soft_delete_match", {
    p_session_id: planned.sessionId,
  });
  if (rpc.error && isMissingRpcFunction(rpc.error)) {
    const fallback = await actor.supabase.rpc("admin_soft_delete_session", {
      p_session_id: planned.sessionId,
    });
    if (fallback.error) {
      console.error("softDeleteMatch fallback", fallback.error.message);
      return fail(matchRpcErrorKey(fallback.error));
    }
  } else if (rpc.error) {
    console.error("softDeleteMatch", rpc.error.message);
    return fail(matchRpcErrorKey(rpc.error));
  }

  const { data: after, error: readError } = await actor.supabase
    .from("training_sessions")
    .select("id, deleted_at")
    .eq("id", planned.sessionId)
    .maybeSingle();
  if (readError) {
    console.error("softDeleteMatch readback", readError.message);
    return fail("generic");
  }
  if (!after) {
    return fail("matchNotFound");
  }
  if (!after.deleted_at) {
    const { data: updated, error: updateError } = await actor.supabase
      .from("training_sessions")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: actor.user.id,
      })
      .eq("id", planned.sessionId)
      .select("id, deleted_at")
      .maybeSingle();
    if (updateError) {
      console.error("softDeleteMatch update", updateError.message);
      return fail(matchRpcErrorKey(updateError));
    }
    if (!updated?.deleted_at) {
      console.error("softDeleteMatch update wrote 0 rows", planned.sessionId);
      return fail("generic");
    }
  }

  const { error: unpublishError } = await actor.supabase
    .from("match_publications")
    .update({
      is_published: false,
      updated_by: actor.user.id,
    })
    .eq("session_id", planned.sessionId);
  if (unpublishError) {
    console.error("softDeleteMatch unpublish", unpublishError.message);
  }

  revalidateMatches([planned.sessionId]);
  redirect({
    href: { pathname: planned.href, query: { deleted: "1" } },
    locale: localeFromForm(formData),
  });
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

  revalidateMatches([sessionId], { roster: true });
  redirectAdmin(`/app/admin/matches/${sessionId}`, formData);
  return ok();
}

export type MatchBroadcastState = OrgActionState & {
  checks?: MatchBroadcastCheck[];
};

/**
 * 「直播與影片」: parse pasted YouTube URLs, check each video with oEmbed
 * (advisory; never blocks saving), store ids via admin_set_match_broadcast.
 * Returns the per-video checks so the form can show them.
 */
export async function setMatchBroadcast(
  sessionId: string,
  _prev: MatchBroadcastState,
  formData: FormData,
): Promise<MatchBroadcastState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const parsed = parseBroadcastForm({
    live: readString(formData, "live_stream_url"),
    replay: readString(formData, "replay_url"),
    highlights: readString(formData, "highlights_url"),
    embedEnabled: readString(formData, "embed_enabled") === "true",
    videoTitle: readString(formData, "video_title"),
    liveWindowBeforeMin: readString(formData, "live_window_before_min"),
  });
  if (!parsed.ok) {
    return fail(parsed.errorKey);
  }

  const targets = BROADCAST_FIELDS.flatMap((field) => {
    const videoId = parsed.ids[field];
    return videoId ? [{ field, videoId }] : [];
  });
  const byId = new Map<string, Promise<{ status: MatchEmbedCheckStatus; title: string | null }>>();
  for (const { videoId } of targets) {
    if (!byId.has(videoId)) {
      byId.set(videoId, checkYouTubeEmbed(videoId));
    }
  }
  const checks: MatchBroadcastCheck[] = await Promise.all(
    targets.map(async ({ field, videoId }) => {
      const result = await byId.get(videoId)!;
      return { field, videoId, status: result.status, title: result.title };
    }),
  );

  const { error } = await actor.supabase.rpc("admin_set_match_broadcast", {
    p_session_id: sessionId,
    p_live_stream_url: parsed.urls.live,
    p_live_video_id: parsed.ids.live,
    p_replay_url: parsed.urls.replay,
    p_replay_video_id: parsed.ids.replay,
    p_highlights_url: parsed.urls.highlights,
    p_highlights_video_id: parsed.ids.highlights,
    p_embed_enabled: parsed.embedEnabled,
    p_embed_check_status: combineEmbedStatuses(checks.map((check) => check.status)),
    p_video_title: pickVideoTitle(parsed.videoTitle, checks),
    p_live_window_before_min: parsed.liveWindowBeforeMin,
  });

  if (error) {
    console.error("setMatchBroadcast", error.message);
    return fail(matchRpcErrorKey(error));
  }

  revalidateMatches([sessionId]);
  return { ok: true, errorKey: null, checks };
}

/** Opponent club, public venue, season, competition and round for the official site. */
export async function setMatchListing(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const parsed = parseMatchListingForm({
    opponentClubId: readString(formData, "opponent_club_id"),
    publicVenueId: readString(formData, "public_venue_id"),
    seasonId: readString(formData, "season_id"),
    competitionId: readString(formData, "competition_id"),
    roundNo: readString(formData, "round_no"),
    roundLabel: readString(formData, "round_label"),
  });
  if (!parsed.ok) {
    return fail(parsed.errorKey);
  }

  const { error } = await actor.supabase.rpc("admin_set_match_listing", {
    p_session_id: sessionId,
    p_opponent_club_id: parsed.opponentClubId,
    p_public_venue_id: parsed.publicVenueId,
    p_season_id: parsed.seasonId,
    p_competition_id: parsed.competitionId,
    p_round_no: parsed.roundNo,
    p_round_label: parsed.roundLabel,
  });

  if (error) {
    console.error("setMatchListing", error.message);
    return fail(error.code === "23503" ? "invalidListing" : matchRpcErrorKey(error));
  }

  revalidateMatches([sessionId]);
  redirectAdmin(`/app/admin/matches/${sessionId}`, formData);
  return ok();
}
