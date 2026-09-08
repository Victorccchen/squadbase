/**
 * Shared helpers for admin multi-team create.
 * Each selected team_id is created independently via existing RPCs.
 * Partial success is reported (not rolled back) so successful teams stay visible.
 */

import type { OrgActionState, OrgErrorKey, TeamCreateRowResult } from "./errors.ts";
import { parseUuid } from "./parse.ts";

export type ParseSelectedTeamIdsResult =
  | { ok: true; teamIds: string[] }
  | { ok: false; errorKey: "missingTeam" };

export type MultiTeamCreateDecision =
  | {
      action: "redirect";
      hrefKind: "detail" | "list";
      createdId: string | null;
      results: TeamCreateRowResult[];
    }
  | {
      action: "report";
      state: OrgActionState;
    };

/** Deduped UUIDs from checkbox values. Empty / all-invalid → missingTeam (TMT-C3). */
export function parseSelectedTeamIds(values: readonly string[]): ParseSelectedTeamIdsResult {
  const teamIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const id = parseUuid(raw.trim());
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    teamIds.push(id);
  }
  if (teamIds.length === 0) {
    return { ok: false, errorKey: "missingTeam" };
  }
  return { ok: true, teamIds };
}

/**
 * All-success → redirect (single match detail when only one team, else the list).
 * Any failure → stay on the form with per-team results (TMT-C4). Successful
 * teams are kept; we do not attempt a compensating delete.
 */
export function decideMultiTeamCreate(input: {
  results: TeamCreateRowResult[];
  preferDetailWhenSingle: boolean;
}): MultiTeamCreateDecision {
  const { results, preferDetailWhenSingle } = input;
  if (results.length === 0) {
    return { action: "report", state: { ok: false, errorKey: "missingTeam" } };
  }

  const succeeded = results.filter((row) => row.ok);
  const failed = results.filter((row) => !row.ok);

  if (failed.length === 0) {
    const createdId = succeeded[0]?.createdId ?? null;
    if (preferDetailWhenSingle && succeeded.length === 1 && createdId) {
      return { action: "redirect", hrefKind: "detail", createdId, results };
    }
    return { action: "redirect", hrefKind: "list", createdId, results };
  }

  const firstError: OrgErrorKey = failed[0]?.errorKey ?? "generic";
  return {
    action: "report",
    state: {
      ok: false,
      errorKey: succeeded.length > 0 ? "partialTeamCreates" : firstError,
      teamResults: results,
    },
  };
}
