/**
 * Stage ST: 梯隊 (age squad) vs 隊伍 (competition team).
 *
 * Physical table remains `teams` with `kind`. Views `age_squads` and
 * `competition_teams` document the two layers. Dual-membership rules apply
 * only to 隊伍 and replace the PR #22 one-ladder-step-up rule.
 */

import type { AgeBand, SessionKind } from "../supabase/database.types.ts";
import {
  ageSquadBandFromCompletedAge,
  birthAgeLabelFromBirthDate,
  birthAgeLabelFromCompletedAge,
  type BirthAgeLabel,
  BIRTH_AGE_LABELS,
  isBirthAgeLabel,
  ageBandFromBirthDate,
} from "../age-band.ts";

export {
  ageSquadBandFromCompletedAge,
  birthAgeLabelFromBirthDate,
  birthAgeLabelFromCompletedAge,
  type BirthAgeLabel,
  BIRTH_AGE_LABELS,
  isBirthAgeLabel,
};

export function ageSquadBandFromBirthDate(
  birthDate: Parameters<typeof ageBandFromBirthDate>[0],
  asOf?: Parameters<typeof ageBandFromBirthDate>[1],
): AgeBand | null {
  return ageBandFromBirthDate(birthDate, asOf);
}

export const TEAM_KINDS = ["age_squad", "competition_team"] as const;
export type TeamKind = (typeof TEAM_KINDS)[number];

export const LAYER_KEYS = [
  "u6",
  "u8",
  "u9",
  "u10",
  "u12",
  "u15",
  "u18",
  "reserve",
  "senior",
] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];

export const MAX_ACTIVE_COMPETITION_MEMBERSHIPS = 2;

export const AGE_SQUAD_SEED_NAMES: Record<AgeBand, string> = {
  U6: "梯隊 U6",
  U8: "梯隊 U8",
  U10: "梯隊 U10",
  U12: "梯隊 U12",
  U15: "梯隊 U15",
  U18: "梯隊 U18",
  reserve: "預備隊",
  senior: "成人隊",
};

/** Locked Futuro 隊伍 names, layer keys, and birth eligibility (Victor Stage ST). */
export const FUTURO_COMPETITION_TEAMS = [
  {
    name: "Futuro U8",
    layerKey: "u8" as const,
    ageBand: "U8" as const,
    eligibleBirthAges: ["U6", "U7", "U8"] as const,
  },
  {
    name: "Futuro U9",
    layerKey: "u9" as const,
    ageBand: "U8" as const,
    eligibleBirthAges: ["U8", "U9"] as const,
  },
  {
    name: "Futuro U10藍",
    layerKey: "u10" as const,
    ageBand: "U10" as const,
    eligibleBirthAges: ["U9", "U10"] as const,
  },
  {
    name: "Futuro U10白",
    layerKey: "u10" as const,
    ageBand: "U10" as const,
    eligibleBirthAges: ["U9", "U10"] as const,
  },
] as const;

export type FuturoCompetitionTeam = (typeof FUTURO_COMPETITION_TEAMS)[number];

export function isTeamKind(value: string): value is TeamKind {
  return (TEAM_KINDS as readonly string[]).includes(value);
}

export function isLayerKey(value: string): value is LayerKey {
  return (LAYER_KEYS as readonly string[]).includes(value);
}

export function isAgeSquad(team: { kind?: string | null }): boolean {
  return team.kind === "age_squad";
}

export function isCompetitionTeam(team: { kind?: string | null }): boolean {
  return team.kind === "competition_team";
}

export function ageBandFromLayerKey(layerKey: LayerKey): AgeBand {
  switch (layerKey) {
    case "u6":
      return "U6";
    case "u8":
    case "u9":
      return "U8";
    case "u10":
      return "U10";
    case "u12":
      return "U12";
    case "u15":
      return "U15";
    case "u18":
      return "U18";
    case "reserve":
      return "reserve";
    case "senior":
      return "senior";
  }
}

export function defaultEligibleBirthAges(layerKey: LayerKey): BirthAgeLabel[] {
  switch (layerKey) {
    case "u6":
      return ["U6"];
    case "u8":
      return ["U6", "U7", "U8"];
    case "u9":
      return ["U8", "U9"];
    case "u10":
      return ["U9", "U10"];
    case "u12":
      return ["U11", "U12"];
    case "u15":
      return ["U13", "U14", "U15"];
    case "u18":
      return ["U16", "U17", "U18"];
    case "reserve":
    case "senior":
      return ["senior"];
  }
}

export type CompetitionEligibilityTeam = {
  id: string;
  kind?: string | null;
  layer_key?: string | null;
  eligible_birth_ages?: readonly string[] | null;
};

export type CompetitionMembershipDecision =
  | { ok: true }
  | {
      ok: false;
      errorKey:
        | "continuesTrainingRequired"
        | "membershipBirthNotEligible"
        | "membershipLayerConflict"
        | "tooManyActiveMemberships"
        | "invalidTeamKind";
    };

/**
 * T-ST dual 隊伍 rule: continues_training, birth eligibility, max 2,
 * same layer_key forbidden. Does not apply to 梯隊.
 */
export function competitionMembershipDecision(input: {
  birthAge: BirthAgeLabel | null;
  continuesTraining: boolean;
  team: CompetitionEligibilityTeam;
  otherActiveTeams: readonly CompetitionEligibilityTeam[];
  /** Keep an already-active 隊伍 when continues_training is later turned off. */
  isExistingMembership?: boolean;
}): CompetitionMembershipDecision {
  if (!isCompetitionTeam(input.team) && input.team.kind != null) {
    return { ok: false, errorKey: "invalidTeamKind" };
  }
  if (!input.continuesTraining && !input.isExistingMembership) {
    return { ok: false, errorKey: "continuesTrainingRequired" };
  }
  if (!input.birthAge) {
    return { ok: false, errorKey: "membershipBirthNotEligible" };
  }
  const eligible = input.team.eligible_birth_ages ?? [];
  if (!eligible.includes(input.birthAge)) {
    return { ok: false, errorKey: "membershipBirthNotEligible" };
  }

  const others = input.otherActiveTeams.filter((row) => row.id !== input.team.id);
  const layer = input.team.layer_key ?? null;
  if (layer && others.some((row) => row.layer_key === layer)) {
    return { ok: false, errorKey: "membershipLayerConflict" };
  }
  if (others.length >= MAX_ACTIVE_COMPETITION_MEMBERSHIPS) {
    return { ok: false, errorKey: "tooManyActiveMemberships" };
  }
  return { ok: true };
}

export function isCompetitionTeamAllowedForPlayer(input: {
  birthAge: BirthAgeLabel | null;
  continuesTraining: boolean;
  team: CompetitionEligibilityTeam;
  otherActiveTeams?: readonly CompetitionEligibilityTeam[];
}): boolean {
  return competitionMembershipDecision({
    ...input,
    otherActiveTeams: input.otherActiveTeams ?? [],
  }).ok;
}

export function isAgeSquadAllowedForPlayer(
  naturalSquad: AgeBand | null,
  squadBand: AgeBand,
): boolean {
  return naturalSquad === squadBand;
}

export function teamsForTrainingCreate<T extends { kind?: string | null }>(teams: readonly T[]): T[] {
  return teams.filter((team) => isAgeSquad(team));
}

export function teamsForMatchCreate<T extends { kind?: string | null }>(teams: readonly T[]): T[] {
  return teams.filter((team) => isCompetitionTeam(team));
}

export function isTeamKindAllowedForSessionKind(
  sessionKind: SessionKind,
  teamKind: TeamKind | string | null | undefined,
): boolean {
  if (sessionKind === "regular" || sessionKind === "special") {
    return teamKind === "age_squad";
  }
  if (sessionKind === "cup" || sessionKind === "league" || sessionKind === "friendly") {
    return teamKind === "competition_team";
  }
  return false;
}

export function parseEligibleBirthAges(values: readonly string[]): BirthAgeLabel[] {
  const result: BirthAgeLabel[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!isBirthAgeLabel(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function futuroTeamByName(name: string): FuturoCompetitionTeam | undefined {
  return FUTURO_COMPETITION_TEAMS.find((team) => team.name === name);
}
