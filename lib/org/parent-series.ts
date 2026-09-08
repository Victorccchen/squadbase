/**
 * Stage 6P parent training vs competition lists, series grouping, and bulk RSVP plans.
 * Bulk plans reuse the same eligibility / 24h cancel lock as the existing RPCs.
 */

import type { SessionKind } from "../supabase/database.types.ts";
import type { OrgErrorKey } from "./errors.ts";
import { MATCH_KINDS, isMatchKind, type MatchKind } from "./match.ts";
import { parseUuid } from "./parse.ts";
import {
  TRAINING_SESSION_KINDS,
  isTrainingSessionKind,
  type TrainingSessionKind,
} from "./session-recurrence.ts";
import { isGuardianCancelLocked, isSessionOpenForSignup } from "./session-time.ts";

export { TRAINING_SESSION_KINDS, isTrainingSessionKind, type TrainingSessionKind };

export const COMPETITION_SESSION_KINDS = MATCH_KINDS;

export function isCompetitionSessionKind(kind: string): kind is MatchKind {
  return isMatchKind(kind);
}

export function filterSessionsByKinds<T extends { kind: SessionKind }>(
  sessions: readonly T[],
  kinds: readonly SessionKind[],
): T[] {
  const allowed = new Set<string>(kinds);
  return sessions.filter((session) => allowed.has(session.kind));
}

export type ParentGroupKind = "training-series" | "training-one-off" | "match-group";

export type ParentSeriesSession = {
  id: string;
  series_id: string | null;
  team_id: string;
  title: string;
  kind: SessionKind;
  starts_at: string;
};

export type ParentSeriesGroup<T extends ParentSeriesSession = ParentSeriesSession> = {
  key: string;
  groupKind: ParentGroupKind;
  seriesId: string | null;
  teamId: string;
  title: string;
  sessionKind: SessionKind;
  sessions: T[];
};

function sortByStart<T extends { starts_at: string }>(sessions: T[]): T[] {
  return sessions.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function sortGroups<T extends ParentSeriesSession>(groups: ParentSeriesGroup<T>[]): ParentSeriesGroup<T>[] {
  return groups.slice().sort((a, b) => {
    const aStart = a.sessions[0]?.starts_at ?? "";
    const bStart = b.sessions[0]?.starts_at ?? "";
    if (aStart !== bStart) {
      return aStart.localeCompare(bStart);
    }
    return a.title.localeCompare(b.title);
  });
}

/** Training: group by series_id when present; orphan sessions stay one-off. */
export function groupTrainingSessionsForParent<T extends ParentSeriesSession>(
  sessions: readonly T[],
): ParentSeriesGroup<T>[] {
  const training = filterSessionsByKinds(sessions, TRAINING_SESSION_KINDS);
  const seriesBuckets = new Map<string, T[]>();
  const oneOffs: T[] = [];

  for (const session of training) {
    if (session.series_id) {
      const list = seriesBuckets.get(session.series_id) ?? [];
      list.push(session);
      seriesBuckets.set(session.series_id, list);
    } else {
      oneOffs.push(session);
    }
  }

  const groups: ParentSeriesGroup<T>[] = [];
  for (const [seriesId, rows] of seriesBuckets) {
    const sorted = sortByStart(rows);
    const first = sorted[0];
    if (!first) {
      continue;
    }
    groups.push({
      key: `series:${seriesId}`,
      groupKind: "training-series",
      seriesId,
      teamId: first.team_id,
      title: first.title,
      sessionKind: first.kind,
      sessions: sorted,
    });
  }
  for (const session of sortByStart(oneOffs)) {
    groups.push({
      key: `one-off:${session.id}`,
      groupKind: "training-one-off",
      seriesId: null,
      teamId: session.team_id,
      title: session.title,
      sessionKind: session.kind,
      sessions: [session],
    });
  }
  return sortGroups(groups);
}

function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToUtf8(encoded: string): string | null {
  try {
    const padded = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export type MatchGroupKey = {
  teamId: string;
  kind: MatchKind;
  title: string;
};

export function encodeMatchGroupKey(input: MatchGroupKey): string {
  return utf8ToBase64Url(JSON.stringify([input.teamId, input.kind, input.title]));
}

export function decodeMatchGroupKey(encoded: string): MatchGroupKey | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return null;
  }
  const json = base64UrlToUtf8(encoded);
  if (!json) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length !== 3) {
      return null;
    }
    const [teamId, kind, title] = parsed;
    if (typeof teamId !== "string" || !parseUuid(teamId)) {
      return null;
    }
    if (typeof kind !== "string" || !isMatchKind(kind)) {
      return null;
    }
    if (typeof title !== "string" || title.length < 1 || title.length > 200) {
      return null;
    }
    return { teamId, kind, title };
  } catch {
    return null;
  }
}

export function matchGroupKeyFromSession(session: {
  team_id: string;
  kind: SessionKind;
  title: string;
}): MatchGroupKey | null {
  if (!isMatchKind(session.kind)) {
    return null;
  }
  return { teamId: session.team_id, kind: session.kind, title: session.title };
}

/** Matches: group by (team_id, kind, title) so Victory League shells cluster without DB series. */
export function groupMatchSessionsForParent<T extends ParentSeriesSession>(
  sessions: readonly T[],
): ParentSeriesGroup<T>[] {
  const matches = filterSessionsByKinds(sessions, COMPETITION_SESSION_KINDS);
  const buckets = new Map<string, T[]>();

  for (const session of matches) {
    const key = matchGroupKeyFromSession(session);
    if (!key) {
      continue;
    }
    const encoded = encodeMatchGroupKey(key);
    const list = buckets.get(encoded) ?? [];
    list.push(session);
    buckets.set(encoded, list);
  }

  const groups: ParentSeriesGroup<T>[] = [];
  for (const [encoded, rows] of buckets) {
    const sorted = sortByStart(rows);
    const first = sorted[0];
    if (!first) {
      continue;
    }
    groups.push({
      key: encoded,
      groupKind: "match-group",
      seriesId: first.series_id,
      teamId: first.team_id,
      title: first.title,
      sessionKind: first.kind,
      sessions: sorted,
    });
  }
  return sortGroups(groups);
}

export function parentOccurrencePath(session: { id: string; kind: SessionKind }): string {
  return isCompetitionSessionKind(session.kind)
    ? `/app/competitions/${session.id}`
    : `/app/sessions/${session.id}`;
}

export function parentGroupPath(group: ParentSeriesGroup): string {
  if (group.groupKind === "training-series" && group.seriesId) {
    return `/app/sessions/series/${group.seriesId}`;
  }
  if (group.groupKind === "match-group") {
    return `/app/competitions/group/${group.key}`;
  }
  const first = group.sessions[0];
  return first ? parentOccurrencePath(first) : "/app/sessions";
}

export function nextOccurrenceInGroup<T extends { starts_at: string }>(
  sessions: readonly T[],
  now = new Date(),
): T | null {
  const sorted = sortByStart([...sessions]);
  const upcoming = sorted.find((row) => {
    const start = Date.parse(row.starts_at);
    return !Number.isNaN(start) && start >= now.getTime();
  });
  return upcoming ?? sorted[sorted.length - 1] ?? null;
}

export function adminGroupHref(group: ParentSeriesGroup, now = new Date()): string {
  const next = nextOccurrenceInGroup(group.sessions, now);
  if (!next) {
    return group.groupKind === "match-group" ? "/app/admin/matches" : "/app/admin/sessions";
  }
  return isMatchKind(group.sessionKind)
    ? `/app/admin/matches/${next.id}`
    : `/app/admin/sessions/${next.id}`;
}

export type ParentReturnTo =
  | "sessions"
  | "session"
  | "competitions"
  | "competition"
  | "training-series"
  | "competition-group";

export function parseParentReturnTo(value: string): ParentReturnTo {
  switch (value) {
    case "competitions":
    case "competition":
    case "training-series":
    case "competition-group":
    case "session":
      return value;
    default:
      return "sessions";
  }
}

export function parentReturnPath(input: {
  returnTo: string;
  sessionId?: string | null;
  seriesId?: string | null;
  groupKey?: string | null;
}): string {
  const returnTo = parseParentReturnTo(input.returnTo);
  switch (returnTo) {
    case "competitions":
      return "/app/competitions";
    case "competition":
      return input.sessionId ? `/app/competitions/${input.sessionId}` : "/app/competitions";
    case "training-series":
      return input.seriesId ? `/app/sessions/series/${input.seriesId}` : "/app/sessions";
    case "competition-group":
      return input.groupKey && decodeMatchGroupKey(input.groupKey)
        ? `/app/competitions/group/${input.groupKey}`
        : "/app/competitions";
    case "session":
      return input.sessionId ? `/app/sessions/${input.sessionId}` : "/app/sessions";
    default:
      return "/app/sessions";
  }
}

export type BulkPlanAction = "register" | "cancel" | "skip";

export type BulkPlanRow<T> = {
  session: T;
  action: BulkPlanAction;
  reason: OrgErrorKey | null;
};

export type BulkRsvpPlan<T> = {
  guardianError: OrgErrorKey | null;
  rows: BulkPlanRow<T>[];
};

export type BulkRegisterSession = {
  id: string;
  team_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  deleted_at?: string | null;
};

export function planBulkSeriesRegister<T extends BulkRegisterSession>(input: {
  sessions: readonly T[];
  playerId: string;
  approvedPlayerIds: readonly string[];
  playerTeamId: string | null;
  registeredSessionIds: ReadonlySet<string>;
  now?: Date;
}): BulkRsvpPlan<T> {
  if (!input.playerId) {
    return { guardianError: "missingPlayer", rows: [] };
  }
  if (!input.approvedPlayerIds.includes(input.playerId)) {
    return { guardianError: "notApprovedGuardian", rows: [] };
  }

  const now = input.now ?? new Date();
  const rows: BulkPlanRow<T>[] = [];
  for (const session of input.sessions) {
    if (input.playerTeamId !== session.team_id) {
      rows.push({ session, action: "skip", reason: "playerNotOnSessionTeam" });
      continue;
    }
    if (!isSessionOpenForSignup(session, now)) {
      rows.push({ session, action: "skip", reason: "sessionNotActive" });
      continue;
    }
    if (input.registeredSessionIds.has(session.id)) {
      rows.push({ session, action: "skip", reason: "alreadyRegistered" });
      continue;
    }
    rows.push({ session, action: "register", reason: null });
  }
  return { guardianError: null, rows };
}

export function planBulkSeriesCancel<T extends { id: string; starts_at: string }>(input: {
  sessions: readonly T[];
  playerId: string;
  approvedPlayerIds: readonly string[];
  registeredSessionIds: ReadonlySet<string>;
  now?: Date;
}): BulkRsvpPlan<T> {
  if (!input.playerId) {
    return { guardianError: "missingPlayer", rows: [] };
  }
  if (!input.approvedPlayerIds.includes(input.playerId)) {
    return { guardianError: "notApprovedGuardian", rows: [] };
  }

  const now = input.now ?? new Date();
  const rows: BulkPlanRow<T>[] = [];
  for (const session of input.sessions) {
    if (!input.registeredSessionIds.has(session.id)) {
      rows.push({ session, action: "skip", reason: "cannotCancelRegistration" });
      continue;
    }
    if (isGuardianCancelLocked(session.starts_at, now)) {
      rows.push({ session, action: "skip", reason: "cannotCancelWithin24h" });
      continue;
    }
    rows.push({ session, action: "cancel", reason: null });
  }
  return { guardianError: null, rows };
}
