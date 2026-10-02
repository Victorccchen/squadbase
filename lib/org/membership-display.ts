// Relative imports so `npm test` can load this file without the `@/` alias.
import type { Team, TeamMembership } from "../supabase/database.types.ts";

export type MembershipWithTeam = TeamMembership & { team: Team | null };

export type MembershipDisplayRow = {
  status: string;
  jersey_number: number;
  /** PR-05: "cross" marks a 跨上 梯隊; missing or null on 梯隊 means primary. */
  squad_role?: string | null;
  team: { name: string; kind?: string | null } | null;
};

export function isCrossSquadRow(row: MembershipDisplayRow): boolean {
  return row.team?.kind === "age_squad" && row.squad_role === "cross";
}

function kindRank(row: MembershipDisplayRow): number {
  const kind = row.team?.kind;
  if (kind === "age_squad") {
    return isCrossSquadRow(row) ? 1 : 0;
  }
  if (kind === "competition_team") {
    return 2;
  }
  return 3;
}

/**
 * Active primary 梯隊 first, then the cross 梯隊, then 隊伍 by name. Unknown/legacy
 * kinds last. Inactive after active.
 */
export function sortMemberships<T extends MembershipDisplayRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const activeCmp = Number(a.status !== "active") - Number(b.status !== "active");
    if (activeCmp !== 0) {
      return activeCmp;
    }
    const kindCmp = kindRank(a) - kindRank(b);
    if (kindCmp !== 0) {
      return kindCmp;
    }
    const nameCmp = (a.team?.name ?? "").localeCompare(b.team?.name ?? "");
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.jersey_number - b.jersey_number;
  });
}

export function formatActiveMembershipSummary(
  memberships: MembershipDisplayRow[] | undefined,
  options: { crossLabel?: string } = {},
): string | null {
  const labels = sortMemberships(memberships ?? [])
    .filter((row): row is MembershipDisplayRow & { team: { name: string; kind?: string | null } } =>
      row.status === "active" && row.team !== null,
    )
    .map((row) => {
      const name =
        options.crossLabel && isCrossSquadRow(row)
          ? `${row.team.name} (${options.crossLabel})`
          : row.team.name;
      return `${name} · #${row.jersey_number}`;
    });
  if (labels.length === 0) {
    return null;
  }
  return labels.join(" · ");
}

/** `ageSquad` is the primary 梯隊 (prices follow it); `crossSquad` the optional 跨上 梯隊. */
export function splitMemberships<T extends MembershipDisplayRow>(memberships: T[]): {
  ageSquad: T | null;
  crossSquad: T | null;
  competition: T[];
} {
  const active = memberships.filter((row) => row.status === "active");
  return {
    ageSquad:
      active.find((row) => row.team?.kind === "age_squad" && !isCrossSquadRow(row)) ?? null,
    crossSquad: active.find((row) => isCrossSquadRow(row)) ?? null,
    competition: active.filter((row) => row.team?.kind === "competition_team"),
  };
}

type SquadChildRow = { player: { id: string }; teamId: string; isCrossSquad: boolean };

/** One row per player; a primary 梯隊 row replaces an earlier cross 梯隊 row. */
export function uniqueByPlayerPreferPrimary<T extends SquadChildRow>(rows: readonly T[]): T[] {
  const byPlayer = new Map<string, number>();
  const result: T[] = [];
  for (const row of rows) {
    const index = byPlayer.get(row.player.id);
    if (index === undefined) {
      byPlayer.set(row.player.id, result.length);
      result.push(row);
    } else if (result[index]?.isCrossSquad && !row.isCrossSquad) {
      result[index] = row;
    }
  }
  return result;
}

/** Team ids that are only a cross 梯隊 for these children, so their sessions get the 跨上 tag. */
export function crossOnlyTeamIds(rows: readonly SquadChildRow[]): Set<string> {
  const primary = new Set(rows.filter((row) => !row.isCrossSquad).map((row) => row.teamId));
  return new Set(
    rows.filter((row) => row.isCrossSquad && !primary.has(row.teamId)).map((row) => row.teamId),
  );
}
