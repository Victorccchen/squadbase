// Relative imports so `npm test` can load this file without the `@/` alias.
import { isAgeBand, parseIsoDate } from "../age-band.ts";
import type { AgeBand, OrgStatus } from "../supabase/database.types.ts";

export function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function readAllStrings(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseOrgStatus(value: string): OrgStatus | null {
  if (value === "active" || value === "inactive") {
    return value;
  }
  return null;
}

export function parseAgeBand(value: string): AgeBand | null {
  return isAgeBand(value) ? value : null;
}

export function parseJersey(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) {
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    return null;
  }
  return n;
}

export function optionalTrimmed(value: string): string | null {
  return value.length > 0 ? value : null;
}

export type ParsedPlayerNames = {
  nameZh: string | null;
  nameEnGiven: string;
  nameEnFamily: string;
  nameJa: string | null;
};

export type PlayerNameErrorKey = "invalidName" | "missingCjkName";

export function parsePlayerNames(formData: FormData): ParsedPlayerNames {
  return {
    nameZh: optionalTrimmed(readString(formData, "name_zh")),
    nameEnGiven: readString(formData, "name_en_given"),
    nameEnFamily: readString(formData, "name_en_family"),
    nameJa: optionalTrimmed(readString(formData, "name_ja")),
  };
}

export function playerNamesError(names: ParsedPlayerNames): PlayerNameErrorKey | null {
  if (!names.nameEnGiven || !names.nameEnFamily) {
    return "invalidName";
  }
  if (!names.nameZh && !names.nameJa) {
    return "missingCjkName";
  }
  return null;
}

export function parseBirthDate(value: string, todayIso: string): string | "future" | null {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return null;
  }
  if (value > todayIso) {
    return "future";
  }
  return value;
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

export function isUniqueViolation(error: PgLikeError): boolean {
  if (!error) {
    return false;
  }
  if (error.code === "23505") {
    return true;
  }
  return errorBlob(error).includes("duplicate key");
}

export function isJerseyUniqueViolation(error: PgLikeError): boolean {
  if (!isUniqueViolation(error)) {
    return false;
  }
  const text = errorBlob(error);
  return (
    text.includes("team_memberships_team_jersey") ||
    text.includes("jersey_number") ||
    text.includes("(team_id, jersey_number)")
  );
}

export function isPlayersCjkNameCheckViolation(error: PgLikeError): boolean {
  if (!error) {
    return false;
  }
  if (error.code !== "23514" && !errorBlob(error).includes("check constraint")) {
    return false;
  }
  return errorBlob(error).includes("players_name_zh_or_ja_present");
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUuid(value: string): string | null {
  return UUID_RE.test(value) ? value.toLowerCase() : null;
}

export const GUARDIAN_RELATIONS = ["parent", "guardian", "other"] as const;
export type ParsedGuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

export function parseGuardianRelation(value: string): ParsedGuardianRelation | null {
  return (GUARDIAN_RELATIONS as readonly string[]).includes(value)
    ? (value as ParsedGuardianRelation)
    : null;
}

export function parseLinkDecision(value: string): "approved" | "rejected" | null {
  if (value === "approved" || value === "rejected") {
    return value;
  }
  return null;
}

export function canParentCancelLink(status: string): boolean {
  return status === "pending";
}

export function canAdminRevokeLink(status: string): boolean {
  return status === "approved";
}

export function teamHasNoDeleteBlockers(activeMembershipCount: number): boolean {
  return activeMembershipCount === 0;
}

type LifecycleErrorKey =
  | "teamHasActiveMemberships"
  | "teamHasCoachAssignments"
  | "teamHasMemberships"
  | "teamNotFound"
  | "generic";

export function teamDeleteErrorKey(error: PgLikeError): LifecycleErrorKey {
  const text = errorBlob(error);
  if (text.includes("team has active memberships")) {
    return "teamHasActiveMemberships";
  }
  if (text.includes("team has coach assignments")) {
    return "teamHasCoachAssignments";
  }
  if (text.includes("team has memberships") || text.includes("team_memberships")) {
    return "teamHasMemberships";
  }
  if (text.includes("team not found")) {
    return "teamNotFound";
  }
  return "generic";
}

export function isLinkNotApprovedViolation(error: PgLikeError): boolean {
  return errorBlob(error).includes("link not found or not approved");
}

export const MIN_SEARCH_NAME_FRAGMENT = 2;
export const MAX_SEARCH_NAME_FRAGMENT = 80;
export const MAX_LINK_NOTE = 1000;

export function parseNameFragment(value: string): string {
  return value.trim();
}

export function isNameFragmentComplete(value: string): boolean {
  return (
    value.length >= MIN_SEARCH_NAME_FRAGMENT &&
    value.length <= MAX_SEARCH_NAME_FRAGMENT
  );
}

export type GuardianSearchFields = {
  teamId: string | null;
  jersey: number | null;
  birthDate: string | null;
  nameFragment: string;
  jerseyMode: boolean;
  identityMode: boolean;
};

export type GuardianSearchParseResult =
  | { ok: true; fields: GuardianSearchFields }
  | { ok: false; errorKey: "incompleteSearch" | "searchNameTooShort" | "invalidBirthDate" | "futureBirthDate" };

export function parseGuardianSearch(
  formData: FormData,
  todayIso: string,
): GuardianSearchParseResult {
  const teamId = parseUuid(readString(formData, "team_id"));
  const jerseyRaw = readString(formData, "jersey_number");
  const jersey = jerseyRaw ? parseJersey(jerseyRaw) : null;
  const birthRaw = readString(formData, "birth_date");
  const birthDate = birthRaw ? parseBirthDate(birthRaw, todayIso) : null;
  const nameFragment = parseNameFragment(readString(formData, "name_fragment"));

  if (birthDate === "future") {
    return { ok: false, errorKey: "futureBirthDate" };
  }
  if (birthRaw && birthDate === null) {
    return { ok: false, errorKey: "invalidBirthDate" };
  }

  const jerseyMode = Boolean(teamId && jersey !== null);
  const identityMode = Boolean(birthDate && isNameFragmentComplete(nameFragment));

  if (!jerseyMode && !identityMode) {
    if (nameFragment.length === 1 || (birthDate && nameFragment.length > 0 && !isNameFragmentComplete(nameFragment))) {
      return { ok: false, errorKey: "searchNameTooShort" };
    }
    return { ok: false, errorKey: "incompleteSearch" };
  }

  return {
    ok: true,
    fields: {
      teamId: jerseyMode ? teamId : null,
      jersey: jerseyMode ? jersey : null,
      birthDate: identityMode ? (birthDate as string) : null,
      nameFragment: identityMode ? nameFragment : "",
      jerseyMode,
      identityMode,
    },
  };
}

export function parseLinkNote(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_LINK_NOTE);
}

export function isOpenGuardianLinkViolation(error: PgLikeError): boolean {
  if (!error) {
    return false;
  }
  const text = errorBlob(error);
  if (text.includes("open guardian link already exists")) {
    return true;
  }
  if (!isUniqueViolation(error)) {
    return false;
  }
  return (
    text.includes("guardian_player_links_open_pair") ||
    text.includes("(guardian_user_id, player_id)")
  );
}

export function isOpenSessionRegistrationViolation(error: PgLikeError): boolean {
  const text = errorBlob(error);
  if (text.includes("already registered")) {
    return true;
  }
  if (!isUniqueViolation(error)) {
    return false;
  }
  return (
    text.includes("session_registrations_open_pair") ||
    text.includes("(session_id, player_id)")
  );
}

type SessionRpcErrorKey =
  | "forbidden"
  | "sessionNotFound"
  | "sessionNotActive"
  | "notApprovedGuardian"
  | "playerNotOnSessionTeam"
  | "alreadyRegistered"
  | "cannotCancelRegistration"
  | "cannotSwitchSession"
  | "messageBodyRequired"
  | "missingTitle"
  | "invalidSessionKind"
  | "recurrenceMutex"
  | "recurrenceBoundRequired"
  | "invalidWeekCount"
  | "invalidUntilDate"
  | "untilBeforeStart"
  | "tooManyOccurrences"
  | "weekdayRequired"
  | "invalidWeekdays"
  | "endsBeforeStart"
  | "teamNotFound"
  | "generic";

export function sessionRpcErrorKey(error: PgLikeError): SessionRpcErrorKey {
  const text = errorBlob(error);
  if (text.includes("not an approved guardian")) {
    return "notApprovedGuardian";
  }
  if (text.includes("session is not active")) {
    return "sessionNotActive";
  }
  if (text.includes("session series not found") || text.includes("session not found")) {
    return "sessionNotFound";
  }
  if (text.includes("player is not on this session team")) {
    return "playerNotOnSessionTeam";
  }
  if (text.includes("already registered") || isOpenSessionRegistrationViolation(error)) {
    return "alreadyRegistered";
  }
  if (text.includes("cannot cancel registration") || text.includes("registration not found")) {
    return "cannotCancelRegistration";
  }
  if (
    text.includes("cannot switch") ||
    text.includes("cannot switch to the same session")
  ) {
    return "cannotSwitchSession";
  }
  if (text.includes("message body required")) {
    return "messageBodyRequired";
  }
  if (text.includes("title required")) {
    return "missingTitle";
  }
  if (text.includes("invalid session kind")) {
    return "invalidSessionKind";
  }
  if (text.includes("recurrence cannot use both")) {
    return "recurrenceMutex";
  }
  if (text.includes("recurrence requires an end date or a week count")) {
    return "recurrenceBoundRequired";
  }
  if (text.includes("invalid week count")) {
    return "invalidWeekCount";
  }
  if (text.includes("until date is before the first start")) {
    return "untilBeforeStart";
  }
  if (text.includes("too many occurrences")) {
    return "tooManyOccurrences";
  }
  if (text.includes("weekdays required")) {
    return "weekdayRequired";
  }
  if (text.includes("invalid weekdays")) {
    return "invalidWeekdays";
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

type CreditRpcErrorKey =
  | "forbidden"
  | "invalidLast5"
  | "notApprovedGuardian"
  | "packageNotFound"
  | "packageBandMismatch"
  | "creditsNotApplicable"
  | "pendingClaimExists"
  | "claimNotFound"
  | "insufficientCredits"
  | "reasonRequired"
  | "invalidCreditAmount"
  | "invalidPrice"
  | "adjustWouldBeNegative"
  | "pendingLeaveExists"
  | "leaveNotFound"
  | "sessionNotFound"
  | "playerNotOnSessionTeam"
  | "invalidDecision"
  | "generic";

export function creditRpcErrorKey(error: PgLikeError): CreditRpcErrorKey {
  const text = errorBlob(error);
  if (text.includes("invalid last5")) {
    return "invalidLast5";
  }
  if (text.includes("not an approved guardian")) {
    return "notApprovedGuardian";
  }
  if (text.includes("package band mismatch")) {
    return "packageBandMismatch";
  }
  if (text.includes("credits do not apply to this age band")) {
    return "creditsNotApplicable";
  }
  if (text.includes("package not found")) {
    return "packageNotFound";
  }
  if (text.includes("already has a pending leave request")) {
    return "pendingLeaveExists";
  }
  if (text.includes("already has a pending claim")) {
    return "pendingClaimExists";
  }
  if (text.includes("claim not found")) {
    return "claimNotFound";
  }
  if (text.includes("insufficient credits")) {
    return "insufficientCredits";
  }
  if (text.includes("reason required")) {
    return "reasonRequired";
  }
  if (text.includes("invalid credit amount")) {
    return "invalidCreditAmount";
  }
  if (text.includes("invalid price")) {
    return "invalidPrice";
  }
  if (text.includes("adjust would be negative")) {
    return "adjustWouldBeNegative";
  }
  if (text.includes("leave request not found")) {
    return "leaveNotFound";
  }
  if (text.includes("session not found")) {
    return "sessionNotFound";
  }
  if (text.includes("player is not on this session team")) {
    return "playerNotOnSessionTeam";
  }
  if (text.includes("invalid decision")) {
    return "invalidDecision";
  }
  if (text.includes("not authorized")) {
    return "forbidden";
  }
  return "generic";
}

export function parseOptionalBoundedText(
  value: string,
  maxLength: number,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

export function parseRequiredBoundedText(
  value: string,
  maxLength: number,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}
