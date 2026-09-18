/**
 * Apply a Torneopal roster seed plan. Direct table writes (service role).
 * Do not call admin_set_player_* — those RPCs reject a null auth.uid().
 * Membership triggers still enforce 梯隊 / 隊伍 rules.
 */

import type {
  PlannedPlayer,
  RosterSeedAction,
  RosterSeedPlan,
  TorneopalSeedMembership,
} from "./torneopal-roster-seed.ts";

export type RosterApplyResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { zhName: string; lines: number[]; errorKey: string; detail: string }[];
};

export type RosterSeedStore = {
  insertPlayer(player: PlannedPlayer): Promise<{ ok: true; id: string } | { ok: false; detail: string }>;
  updatePlayerIdentity(
    playerId: string,
    player: PlannedPlayer,
  ): Promise<{ ok: true } | { ok: false; detail: string }>;
  listMemberships(playerId: string): Promise<TorneopalSeedMembership[]>;
  upsertMembership(row: {
    playerId: string;
    teamId: string;
    jersey: number;
  }): Promise<{ ok: true } | { ok: false; detail: string }>;
  deactivateMembership(id: string): Promise<{ ok: true } | { ok: false; detail: string }>;
  deletePlayer?(id: string): Promise<{ ok: true } | { ok: false; detail: string }>;
};

function errorResult(
  errors: RosterApplyResult["errors"],
  action: Extract<RosterSeedAction, { kind: "error" }> | {
    zhName: string;
    lines: number[];
    errorKey: string;
    detail: string;
  },
): void {
  errors.push({
    zhName: action.zhName,
    lines: action.lines,
    errorKey: action.errorKey,
    detail: action.detail,
  });
}

async function syncMemberships(
  store: RosterSeedStore,
  playerId: string,
  player: PlannedPlayer,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const current = await store.listMemberships(playerId);
  const keepTeamIds = new Set<string>([player.ageSquadId, ...player.competition.map((row) => row.teamId)]);

  for (const row of current) {
    if (row.status !== "active" || !row.id) {
      continue;
    }
    if (!keepTeamIds.has(row.team_id)) {
      const deactivated = await store.deactivateMembership(row.id);
      if (!deactivated.ok) {
        return deactivated;
      }
    }
  }

  const squad = await store.upsertMembership({
    playerId,
    teamId: player.ageSquadId,
    jersey: player.ageSquadJersey,
  });
  if (!squad.ok) {
    return squad;
  }

  for (const slot of player.competition) {
    const written = await store.upsertMembership({
      playerId,
      teamId: slot.teamId,
      jersey: slot.jersey,
    });
    if (!written.ok) {
      return written;
    }
  }
  return { ok: true };
}

export async function applyTorneopalRosterPlan(
  plan: RosterSeedPlan,
  store: RosterSeedStore,
): Promise<RosterApplyResult> {
  const result: RosterApplyResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (const action of plan.actions) {
    switch (action.kind) {
      case "error":
        errorResult(result.errors, action);
        break;
      case "skip":
        result.skipped += 1;
        break;
      case "create": {
        const inserted = await store.insertPlayer(action.player);
        if (!inserted.ok) {
          errorResult(result.errors, {
            zhName: action.player.zhName,
            lines: action.player.sourceLines,
            errorKey: "generic",
            detail: inserted.detail,
          });
          break;
        }
        const memberships = await syncMemberships(store, inserted.id, action.player);
        if (!memberships.ok) {
          if (store.deletePlayer) {
            await store.deletePlayer(inserted.id);
          }
          errorResult(result.errors, {
            zhName: action.player.zhName,
            lines: action.player.sourceLines,
            errorKey: "generic",
            detail: memberships.detail,
          });
          break;
        }
        result.created += 1;
        break;
      }
      case "update": {
        const identity = await store.updatePlayerIdentity(action.playerId, action.player);
        if (!identity.ok) {
          errorResult(result.errors, {
            zhName: action.player.zhName,
            lines: action.player.sourceLines,
            errorKey: "generic",
            detail: identity.detail,
          });
          break;
        }
        const memberships = await syncMemberships(store, action.playerId, action.player);
        if (!memberships.ok) {
          errorResult(result.errors, {
            zhName: action.player.zhName,
            lines: action.player.sourceLines,
            errorKey: "generic",
            detail: memberships.detail,
          });
          break;
        }
        result.updated += 1;
        break;
      }
      default: {
        const _never: never = action;
        throw new Error(`Unhandled roster seed action: ${JSON.stringify(_never)}`);
      }
    }
  }

  return result;
}

export function formatApplyReport(result: RosterApplyResult): string {
  const lines = [
    `apply created=${result.created} updated=${result.updated} skipped=${result.skipped} errors=${result.errors.length}`,
  ];
  for (const error of result.errors) {
    lines.push(
      `ERROR ${error.errorKey} ${error.zhName || "(unnamed)"} lines=${error.lines.join(",")} ${error.detail}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
