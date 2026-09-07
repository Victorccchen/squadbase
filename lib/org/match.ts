/**
 * Stage 5B public match helpers (pure).
 *
 * Cup/league training_sessions stay the debit source (Stage 4B). A 1:1
 * match_publications row is the public overlay. Cancelled matches are
 * omitted from the public list (T5B-5), not shown as cancelled.
 */

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
  | "generic";

export function matchRpcErrorKey(error: PgLikeError): MatchRpcErrorKey {
  const text = errorBlob(error);
  if (text.includes("match kind must be cup or league")) {
    return "matchKindRequired";
  }
  if (text.includes("opponent required")) {
    return "invalidOpponent";
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
