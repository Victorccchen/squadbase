import type { AssessmentScoreValue } from "../supabase/database.types.ts";

export type {
  AssessmentScoreItem as AssessmentItem,
  AssessmentScoreValue,
  AssessmentSituations,
  AssessmentTraits,
} from "../supabase/database.types.ts";

export const TRAIT_CODES = ["A", "B", "C", "D"] as const;
export const PHASE_CODES = [
  "attack",
  "defence",
  "trans_attack",
  "trans_defence",
] as const;
export const DIMENSION_KINDS = ["trait", "phase"] as const;

export type TraitCode = (typeof TRAIT_CODES)[number];
export type PhaseCode = (typeof PHASE_CODES)[number];
export type DimensionKind = (typeof DIMENSION_KINDS)[number];

export const ASSESSMENT_SCORES = [1, 2, 3, 4, 5] as const;
export const MAX_ASSESSMENT_NOTE = 1000;

/** Stage 5 JSONB situation keys. Used for CTFA hint copy and backfill mapping. */
export const SITUATION_KEYS = [
  "attack",
  "defense",
  "attack_to_defense",
  "defense_to_attack",
] as const;

/** Stage 5 JSONB trait keys. Used for backfill mapping. */
export const TRAIT_KEYS = [
  "adaptability",
  "resilience",
  "coachability",
  "team_commitment",
] as const;

export type SituationKey = (typeof SITUATION_KEYS)[number];
export type TraitKey = (typeof TRAIT_KEYS)[number];

export const STAGE5_SITUATION_TO_PHASE = {
  attack: "attack",
  defense: "defence",
  attack_to_defense: "trans_defence",
  defense_to_attack: "trans_attack",
} as const satisfies Record<SituationKey, PhaseCode>;

export const STAGE5_TRAIT_TO_CODE = {
  adaptability: "A",
  resilience: "B",
  coachability: "C",
  team_commitment: "D",
} as const satisfies Record<TraitKey, TraitCode>;

export const PHASE_HINT_KEY = {
  attack: "attack",
  defence: "defense",
  trans_defence: "attack_to_defense",
  trans_attack: "defense_to_attack",
} as const satisfies Record<PhaseCode, SituationKey>;

export type AssessmentDimensionScore = {
  dimension_kind: DimensionKind;
  dimension_code: TraitCode | PhaseCode;
  score: AssessmentScoreValue;
};

export function isTraitCode(value: string): value is TraitCode {
  return (TRAIT_CODES as readonly string[]).includes(value);
}

export function isPhaseCode(value: string): value is PhaseCode {
  return (PHASE_CODES as readonly string[]).includes(value);
}

export function isDimensionKind(value: string): value is DimensionKind {
  return (DIMENSION_KINDS as readonly string[]).includes(value);
}

export function isAssessmentScoreValue(
  value: number,
): value is AssessmentScoreValue {
  return (ASSESSMENT_SCORES as readonly number[]).includes(value);
}

export function isSituationKey(value: string): value is SituationKey {
  return (SITUATION_KEYS as readonly string[]).includes(value);
}

export function isTraitKey(value: string): value is TraitKey {
  return (TRAIT_KEYS as readonly string[]).includes(value);
}

export function scoreFieldName(
  kind: DimensionKind,
  code: TraitCode | PhaseCode,
): string {
  return `${kind}_${code}_score`;
}

export function dimensionLabelKey(
  kind: DimensionKind,
  code: string,
): `traits.${TraitCode}` | `phases.${PhaseCode}` {
  switch (kind) {
    case "trait":
      if (!isTraitCode(code)) {
        return "traits.A";
      }
      return `traits.${code}`;
    case "phase":
      if (!isPhaseCode(code)) {
        return "phases.attack";
      }
      return `phases.${code}`;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export function phaseFromStage5Situation(key: SituationKey): PhaseCode {
  return STAGE5_SITUATION_TO_PHASE[key];
}

export function traitCodeFromStage5Trait(key: TraitKey): TraitCode {
  return STAGE5_TRAIT_TO_CODE[key];
}

export function clubDateFromTimestamp(iso: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return iso.slice(0, 10);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function assessedAtFromClubDate(dateIso: string): string {
  return `${dateIso}T00:00:00+08:00`;
}
