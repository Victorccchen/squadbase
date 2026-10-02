/**
 * Phase 1 PR-07 venue QR check-in (pure helpers).
 *
 * The database decides which sessions are open (30 minutes before the start
 * until the end) and who may check in; these helpers only shape its JSON for
 * the page and build the QR link.
 */

import type { SessionKind } from "../supabase/database.types.ts";

export type CheckinSession = {
  id: string;
  title: string;
  kind: SessionKind;
  teamName: string;
  startsAt: string;
  endsAt: string;
};

export type CheckinChild = {
  playerId: string;
  names: {
    name_zh: string | null;
    name_ja: string | null;
    name_en_given: string;
    name_en_family: string;
  };
  creditsAvailable: number;
  sessionIds: string[];
  checkedInSessionIds: string[];
};

export type CheckinPreview = {
  venueName: string;
  sessions: CheckinSession[];
  children: CheckinChild[];
};

export type CheckinResult =
  | { playerId: string; result: "no_session" }
  | { playerId: string; result: "choose"; sessionIds: string[] }
  | {
      playerId: string;
      result: "checked_in" | "already";
      sessionId: string;
      creditsDebited: number;
      creditsAvailable: number;
    };

const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function isCheckinToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/** Link printed on the counter QR. The page redirects to the parent's language after sign-in. */
export function checkinUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/zh-Hant/app/checkin/${token}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function int(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

export function parseCheckinPreview(raw: unknown): CheckinPreview | null {
  const root = record(raw);
  if (!root) {
    return null;
  }
  const sessions = (Array.isArray(root.sessions) ? root.sessions : [])
    .map(record)
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({
      id: text(row.id),
      title: text(row.title),
      kind: text(row.kind) as SessionKind,
      teamName: text(row.team_name),
      startsAt: text(row.starts_at),
      endsAt: text(row.ends_at),
    }))
    .filter((row) => row.id);
  const children = (Array.isArray(root.children) ? root.children : [])
    .map(record)
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({
      playerId: text(row.player_id),
      names: {
        name_zh: textOrNull(row.name_zh),
        name_ja: textOrNull(row.name_ja),
        name_en_given: text(row.name_en_given),
        name_en_family: text(row.name_en_family),
      },
      creditsAvailable: int(row.credits_available),
      sessionIds: strings(row.session_ids),
      checkedInSessionIds: strings(row.checked_in_session_ids),
    }))
    .filter((row) => row.playerId);
  return { venueName: text(root.venue_name), sessions, children };
}

export function parseCheckinResults(raw: unknown): CheckinResult[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const results: CheckinResult[] = [];
  for (const item of raw) {
    const row = record(item);
    if (!row) {
      continue;
    }
    const playerId = text(row.player_id);
    const result = text(row.result);
    if (!playerId) {
      continue;
    }
    if (result === "no_session") {
      results.push({ playerId, result });
    } else if (result === "choose") {
      results.push({ playerId, result, sessionIds: strings(row.session_ids) });
    } else if (result === "checked_in" || result === "already") {
      results.push({
        playerId,
        result,
        sessionId: text(row.session_id),
        creditsDebited: int(row.credits_debited),
        creditsAvailable: int(row.credits_available),
      });
    }
  }
  return results;
}

/** Children who can still check in to at least one open session. */
export function childrenToCheckIn(preview: CheckinPreview): CheckinChild[] {
  return preview.children.filter((child) =>
    child.sessionIds.some((id) => !child.checkedInSessionIds.includes(id)),
  );
}

/** Children already checked in to every open session they belong to. */
export function childrenAlreadyIn(preview: CheckinPreview): CheckinChild[] {
  return preview.children.filter(
    (child) =>
      child.sessionIds.length > 0 &&
      child.sessionIds.every((id) => child.checkedInSessionIds.includes(id)),
  );
}

/** Session ids shared by the selected children, when the parent must choose one. */
export function sessionsNeedingChoice(preview: CheckinPreview, playerIds: readonly string[]): CheckinSession[] {
  const ids = new Set<string>();
  for (const child of preview.children) {
    if (!playerIds.includes(child.playerId)) {
      continue;
    }
    const open = child.sessionIds.filter((id) => !child.checkedInSessionIds.includes(id));
    if (open.length > 1) {
      for (const id of open) {
        ids.add(id);
      }
    }
  }
  return preview.sessions.filter((session) => ids.has(session.id));
}
