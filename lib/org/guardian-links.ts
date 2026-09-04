/**
 * Parent-facing guardian–player link helpers.
 * Product rule: at most one pending/approved row per (guardian, player).
 * List builders still dedupe by player_id so duplicate approved rows cannot
 * render twice or share a React key before/without the DB cleanup.
 */

export type OpenLinkLike = {
  id: string;
  player_id: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

function isNewerLink(candidate: OpenLinkLike, current: OpenLinkLike): boolean {
  if (candidate.created_at !== current.created_at) {
    return candidate.created_at > current.created_at;
  }
  const candidateUpdated = candidate.updated_at ?? "";
  const currentUpdated = current.updated_at ?? "";
  if (candidateUpdated !== currentUpdated) {
    return candidateUpdated > currentUpdated;
  }
  return candidate.id > current.id;
}

/** Keep the newest approved link per player_id. Preserves original order of winners. */
export function uniqueApprovedLinksByPlayerId<T extends OpenLinkLike>(
  links: readonly T[],
): T[] {
  const winnerByPlayer = new Map<string, T>();
  for (const link of links) {
    if (link.status !== "approved") {
      continue;
    }
    const existing = winnerByPlayer.get(link.player_id);
    if (!existing || isNewerLink(link, existing)) {
      winnerByPlayer.set(link.player_id, link);
    }
  }

  const winners = new Set<T>(winnerByPlayer.values());
  return links.filter((link) => winners.has(link));
}
