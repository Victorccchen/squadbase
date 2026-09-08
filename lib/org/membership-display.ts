// Relative imports so `npm test` can load this file without the `@/` alias.
import type { Team, TeamMembership } from "../supabase/database.types.ts";

export type MembershipWithTeam = TeamMembership & { team: Team | null };

export type MembershipDisplayRow = {
  status: string;
  jersey_number: number;
  team: { name: string; kind?: string | null } | null;
};

function kindRank(kind: string | null | undefined): number {
  if (kind === "age_squad") {
    return 0;
  }
  if (kind === "competition_team") {
    return 1;
  }
  return 2;
}

/** Active 梯隊 first, then 隊伍 by name. Unknown/legacy kinds last. Inactive after active. */
export function sortMemberships<T extends MembershipDisplayRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const activeCmp = Number(a.status !== "active") - Number(b.status !== "active");
    if (activeCmp !== 0) {
      return activeCmp;
    }
    const kindCmp = kindRank(a.team?.kind) - kindRank(b.team?.kind);
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
): string | null {
  const labels = sortMemberships(memberships ?? [])
    .filter((row): row is MembershipDisplayRow & { team: { name: string; kind?: string | null } } =>
      row.status === "active" && row.team !== null,
    )
    .map((row) => `${row.team.name} · #${row.jersey_number}`);
  if (labels.length === 0) {
    return null;
  }
  return labels.join(" · ");
}

export function splitMemberships<T extends MembershipDisplayRow>(memberships: T[]): {
  ageSquad: T | null;
  competition: T[];
} {
  const active = memberships.filter((row) => row.status === "active");
  return {
    ageSquad: active.find((row) => row.team?.kind === "age_squad") ?? null,
    competition: active.filter((row) => row.team?.kind === "competition_team"),
  };
}
