export type {
  AssessmentScoreItem as AssessmentItem,
  AssessmentScoreValue,
  AssessmentSituations,
  AssessmentTraits,
} from "../supabase/database.types.ts";

export const SITUATION_KEYS = [
  "attack",
  "defense",
  "attack_to_defense",
  "defense_to_attack",
] as const;

export const TRAIT_KEYS = [
  "adaptability",
  "resilience",
  "coachability",
  "team_commitment",
] as const;

export const ASSESSMENT_SCORES = [1, 2, 3, 4, 5] as const;

export type SituationKey = (typeof SITUATION_KEYS)[number];
export type TraitKey = (typeof TRAIT_KEYS)[number];

export const MAX_ASSESSMENT_NOTE = 1000;

export function isSituationKey(value: string): value is SituationKey {
  return (SITUATION_KEYS as readonly string[]).includes(value);
}

export function isTraitKey(value: string): value is TraitKey {
  return (TRAIT_KEYS as readonly string[]).includes(value);
}

export function isAssessmentScoreValue(
  value: number,
): value is import("../supabase/database.types.ts").AssessmentScoreValue {
  return (ASSESSMENT_SCORES as readonly number[]).includes(value);
}
