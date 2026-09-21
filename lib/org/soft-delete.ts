import { canAccessAdmin } from "../auth/roles.ts";
import { parseUuid } from "./parse.ts";
import type { AppRole } from "../supabase/database.types.ts";
import type { OrgErrorKey } from "./errors.ts";

export function isSoftDeleted(row: { deleted_at?: string | null }): boolean {
  return row.deleted_at != null && row.deleted_at !== "";
}

/** Default admin session/match lists hide soft-deleted rows unless includeDeleted is on. */
export function filterDefaultAdminList<T extends { deleted_at?: string | null }>(
  rows: readonly T[],
  includeDeleted = false,
): T[] {
  if (includeDeleted) {
    return [...rows];
  }
  return rows.filter((row) => !isSoftDeleted(row));
}

/** Parent training/competition default lists never include soft-deleted rows. */
export function filterParentDefaultList<T extends { deleted_at?: string | null }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => !isSoftDeleted(row));
}

/** Same gate as existing session soft-delete and match cancel: admin only. */
export function canSoftDeleteOrgRecords(roles: readonly AppRole[]): boolean {
  return canAccessAdmin([...roles]);
}

export type SoftDeleteMatchRedirect = "list" | "detail";

export function parseSoftDeleteRedirect(next: string): SoftDeleteMatchRedirect {
  return next === "list" ? "list" : "detail";
}

export function softDeleteMatchRedirectHref(
  redirectTo: SoftDeleteMatchRedirect,
  sessionId: string,
): "/app/admin/matches" | `/app/admin/matches/${string}` {
  switch (redirectTo) {
    case "list":
      return "/app/admin/matches";
    case "detail":
      return `/app/admin/matches/${sessionId}`;
    default: {
      const _exhaustive: never = redirectTo;
      return _exhaustive;
    }
  }
}

export type PlanSoftDeleteMatchResult =
  | { ok: false; errorKey: Extract<OrgErrorKey, "notConfigured" | "forbidden" | "sessionNotFound"> }
  | {
      ok: true;
      sessionId: string;
      redirectTo: SoftDeleteMatchRedirect;
      href: "/app/admin/matches" | `/app/admin/matches/${string}`;
    };

/** Authz + id + redirect for one-match soft-delete. RPC happens after this gate. */
export function planSoftDeleteMatch(input: {
  configured: boolean;
  roles: readonly AppRole[];
  sessionId: string;
  next: string;
}): PlanSoftDeleteMatchResult {
  if (!input.configured) {
    return { ok: false, errorKey: "notConfigured" };
  }
  if (!canSoftDeleteOrgRecords(input.roles)) {
    return { ok: false, errorKey: "forbidden" };
  }
  const sessionId = parseUuid(input.sessionId);
  if (!sessionId) {
    return { ok: false, errorKey: "sessionNotFound" };
  }
  const redirectTo = parseSoftDeleteRedirect(input.next);
  return {
    ok: true,
    sessionId,
    redirectTo,
    href: softDeleteMatchRedirectHref(redirectTo, sessionId),
  };
}

/** Staging bulk-cleanup title filter: Victory League / VL 2026/27（暫定） shells. */
export function isVictoryLeagueShellTitle(title: string): boolean {
  const normalized = title
    .normalize("NFKC")
    .replace(/[（）]/g, (ch) => (ch === "（" ? "(" : ")"))
    .trim()
    .toLowerCase();
  return /victory\s+league/.test(normalized);
}

export function isFuturoCompetitionTeamName(name: string): boolean {
  return /futuro/i.test(name.normalize("NFKC").trim());
}

const MATCH_KINDS_FOR_BULK = new Set(["cup", "league", "friendly"]);

/** Same predicate as `supabase/staging_soft_delete_victory_league.sql`. */
export function matchesVictoryLeagueBulkSoftDelete(row: {
  title: string;
  kind: string;
  teamName: string;
  teamKind?: string | null;
  deletedAt?: string | null;
}): boolean {
  if (isSoftDeleted({ deleted_at: row.deletedAt ?? null })) {
    return false;
  }
  if (!MATCH_KINDS_FOR_BULK.has(row.kind)) {
    return false;
  }
  if (row.teamKind && row.teamKind !== "competition_team") {
    return false;
  }
  return isVictoryLeagueShellTitle(row.title) && isFuturoCompetitionTeamName(row.teamName);
}
