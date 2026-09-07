/**
 * Stage 5B public match helpers (pure).
 *
 * Cup/league training_sessions stay the debit source (Stage 4B). A 1:1
 * match_publications row is the public overlay. Cancelled matches are
 * omitted from the public list (T5B-5), not shown as cancelled.
 * Opponent may be null (TBD) when the fixture is entered months ahead.
 */

import {
  addMinutesToOffsetIso,
  isEndsAfterStart,
  parseClubDateTimeLocal,
  parseDurationMinutes,
} from "./session-time.ts";

export const MATCH_SIDES = ["home", "away"] as const;
export type MatchSide = (typeof MATCH_SIDES)[number];

export const MATCH_PUBLIC_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type MatchPublicStatus = (typeof MATCH_PUBLIC_STATUSES)[number];

export const MATCH_KINDS = ["cup", "league"] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];

export const DEFAULT_MATCH_DURATION_MINUTES = 90;
export const MAX_MATCH_OPPONENT = 200;
export const MAX_MATCH_RESULT_NOTE = 200;
export const MAX_MATCH_SCORE = 99;
export const MAX_BULK_MATCHES = 40;
export const RECENT_PAST_MS = 90 * 24 * 60 * 60 * 1000;

export const PUBLIC_MATCH_FIELDS = [
  "id",
  "team_id",
  "team_name",
  "title",
  "kind",
  "is_playoff",
  "starts_at",
  "ends_at",
  "location",
  "opponent",
  "side",
  "public_status",
  "club_score",
  "opponent_score",
  "result_note",
] as const;

export const PUBLIC_ROSTER_FIELDS = [
  "player_id",
  "name_zh",
  "name_en_given",
  "name_en_family",
  "name_ja",
  "jersey_number",
] as const;

export const FORBIDDEN_PUBLIC_MATCH_KEYS = [
  "phone",
  "email",
  "birth_date",
  "credits_available",
  "last5",
  "admin_note",
  "parent_note",
  "notes",
  "no_debit",
  "debit_override_n",
  "guardian_user_id",
] as const;

export function isMatchSide(value: string): value is MatchSide {
  return (MATCH_SIDES as readonly string[]).includes(value);
}

export function parseMatchSide(value: string): MatchSide | null {
  return isMatchSide(value) ? value : null;
}

export function isMatchPublicStatus(value: string): value is MatchPublicStatus {
  return (MATCH_PUBLIC_STATUSES as readonly string[]).includes(value);
}

export function parseMatchPublicStatus(value: string): MatchPublicStatus | null {
  return isMatchPublicStatus(value) ? value : null;
}

export function isMatchKind(value: string): value is MatchKind {
  return (MATCH_KINDS as readonly string[]).includes(value);
}

export function parseMatchKind(value: string): MatchKind | null {
  return isMatchKind(value) ? value : null;
}

export function parseMatchOpponent(value: string): { ok: true; opponent: string | null } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, opponent: null };
  }
  if (trimmed.length > MAX_MATCH_OPPONENT) {
    return { ok: false };
  }
  return { ok: true, opponent: trimmed };
}

export function publicOpponentLabel(
  opponent: string | null | undefined,
  tbdLabel: string,
): string {
  const trimmed = opponent?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : tbdLabel;
}

export type BulkMatchKickoff = {
  startsAt: string;
  endsAt: string;
};

export type BulkMatchPlanErrorKey =
  | "invalidSessionTime"
  | "invalidDuration"
  | "endsBeforeStart"
  | "tooManyMatches"
  | "matchKickoffRequired";

export function planBulkMatchCreates(input: {
  kickoffLocals: readonly string[];
  durationMinutes?: string | number | null;
}):
  | { ok: true; rows: BulkMatchKickoff[] }
  | { ok: false; errorKey: BulkMatchPlanErrorKey } {
  const locals = input.kickoffLocals.map((value) => value.trim()).filter(Boolean);
  if (locals.length === 0) {
    return { ok: false, errorKey: "matchKickoffRequired" };
  }
  if (locals.length > MAX_BULK_MATCHES) {
    return { ok: false, errorKey: "tooManyMatches" };
  }

  let duration = DEFAULT_MATCH_DURATION_MINUTES;
  if (input.durationMinutes != null && String(input.durationMinutes).trim() !== "") {
    const parsed =
      typeof input.durationMinutes === "number"
        ? parseDurationMinutes(String(input.durationMinutes))
        : parseDurationMinutes(input.durationMinutes);
    if (!parsed) {
      return { ok: false, errorKey: "invalidDuration" };
    }
    duration = parsed;
  }

  const rows: BulkMatchKickoff[] = [];
  const seen = new Set<string>();
  for (const local of locals) {
    const startsAt = parseClubDateTimeLocal(local);
    if (!startsAt) {
      return { ok: false, errorKey: "invalidSessionTime" };
    }
    if (seen.has(startsAt)) {
      continue;
    }
    const endsAt = addMinutesToOffsetIso(startsAt, duration);
    if (!endsAt) {
      return { ok: false, errorKey: "invalidSessionTime" };
    }
    if (!isEndsAfterStart(startsAt, endsAt)) {
      return { ok: false, errorKey: "endsBeforeStart" };
    }
    seen.add(startsAt);
    rows.push({ startsAt, endsAt });
  }

  if (rows.length === 0) {
    return { ok: false, errorKey: "matchKickoffRequired" };
  }
  if (rows.length > MAX_BULK_MATCHES) {
    return { ok: false, errorKey: "tooManyMatches" };
  }

  rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { ok: true, rows };
}

export function parseMatchScore(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) {
    return null;
  }
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n < 0 || n > MAX_MATCH_SCORE) {
    return null;
  }
  return n;
}

export function formatMatchScore(
  clubScore: number | null,
  opponentScore: number | null,
): string | null {
  if (clubScore === null || opponentScore === null) {
    return null;
  }
  return `${clubScore} – ${opponentScore}`;
}

export type PublicMatchVisibilityInput = {
  isPublished: boolean;
  publicStatus: MatchPublicStatus;
  sessionStatus: "active" | "inactive";
  deletedAt: string | null;
  kind: string;
};

export function isPubliclyListedMatch(input: PublicMatchVisibilityInput): boolean {
  return (
    input.isPublished &&
    (input.publicStatus === "scheduled" || input.publicStatus === "completed") &&
    input.sessionStatus === "active" &&
    input.deletedAt === null &&
    isMatchKind(input.kind)
  );
}

export function isUpcomingMatch(startsAtIso: string, nowMs: number): boolean {
  const starts = Date.parse(startsAtIso);
  if (Number.isNaN(starts)) {
    return false;
  }
  return starts >= nowMs;
}

export function isRecentPastMatch(
  startsAtIso: string,
  nowMs: number,
  windowMs = RECENT_PAST_MS,
): boolean {
  const starts = Date.parse(startsAtIso);
  if (Number.isNaN(starts)) {
    return false;
  }
  return starts < nowMs && starts >= nowMs - windowMs;
}

export function partitionPublicMatches<T extends { starts_at: string }>(
  matches: T[],
  nowMs: number,
): { upcoming: T[]; recentPast: T[] } {
  const upcoming = matches
    .filter((row) => isUpcomingMatch(row.starts_at, nowMs))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const recentPast = matches
    .filter((row) => isRecentPastMatch(row.starts_at, nowMs))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return { upcoming, recentPast };
}

export function publicPayloadHasForbiddenKeys(row: Record<string, unknown>): boolean {
  return FORBIDDEN_PUBLIC_MATCH_KEYS.some((key) => key in row);
}

export function extraPublicMatchKeys(row: Record<string, unknown>): string[] {
  const allowed = new Set<string>(PUBLIC_MATCH_FIELDS);
  return Object.keys(row).filter((key) => !allowed.has(key));
}

export function extraPublicRosterKeys(row: Record<string, unknown>): string[] {
  const allowed = new Set<string>(PUBLIC_ROSTER_FIELDS);
  return Object.keys(row).filter((key) => !allowed.has(key));
}

type PgLikeError = {
  code?: string;
  message?: string;
  details?: string;
} | null;

function errorBlob(error: PgLikeError): string {
  if (!error) {
    return "";
  }
  return `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
}

export type MatchRpcErrorKey =
  | "forbidden"
  | "sessionNotFound"
  | "sessionNotActive"
  | "matchNotFound"
  | "matchKindRequired"
  | "invalidOpponent"
  | "invalidMatchSide"
  | "invalidMatchScore"
  | "matchCancelled"
  | "matchRosterPlayerInvalid"
  | "missingTitle"
  | "endsBeforeStart"
  | "teamNotFound"
  | "tooManyMatches"
  | "matchKickoffRequired"
  | "invalidSessionTime"
  | "generic";

export function matchRpcErrorKey(error: PgLikeError): MatchRpcErrorKey {
  const text = errorBlob(error);
  if (text.includes("match kind must be cup or league")) {
    return "matchKindRequired";
  }
  if (text.includes("opponent required") || text.includes("invalid opponent")) {
    return "invalidOpponent";
  }
  if (text.includes("too many matches")) {
    return "tooManyMatches";
  }
  if (text.includes("kickoff required")) {
    return "matchKickoffRequired";
  }
  if (text.includes("kickoff and end arrays must match")) {
    return "invalidSessionTime";
  }
  if (text.includes("invalid match side")) {
    return "invalidMatchSide";
  }
  if (text.includes("invalid match score")) {
    return "invalidMatchScore";
  }
  if (text.includes("match is cancelled")) {
    return "matchCancelled";
  }
  if (text.includes("match roster player is not on this team")) {
    return "matchRosterPlayerInvalid";
  }
  if (text.includes("match not found")) {
    return "matchNotFound";
  }
  if (text.includes("session is not active")) {
    return "sessionNotActive";
  }
  if (text.includes("session not found")) {
    return "sessionNotFound";
  }
  if (text.includes("title required")) {
    return "missingTitle";
  }
  if (text.includes("end time must be after start time")) {
    return "endsBeforeStart";
  }
  if (text.includes("team not found")) {
    return "teamNotFound";
  }
  if (text.includes("not authorized")) {
    return "forbidden";
  }
  return "generic";
}
