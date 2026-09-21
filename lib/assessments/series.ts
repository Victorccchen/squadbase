import {
  PHASE_CODES,
  TRAIT_CODES,
  isPhaseCode,
  isTraitCode,
  type DimensionKind,
  type PhaseCode,
  type TraitCode,
} from "./model.ts";
import type { AssessmentScoreValue } from "./model.ts";

export type SeriesEvent = {
  assessed_at: string;
  scores: {
    dimension_kind: DimensionKind;
    dimension_code: string;
    score: AssessmentScoreValue;
  }[];
};

export type ChartPoint = {
  at: string;
  score: AssessmentScoreValue;
};

export type DimensionSeries = {
  kind: DimensionKind;
  code: TraitCode | PhaseCode;
  points: ChartPoint[];
};

export const TRAIT_CHART_COLORS: Record<TraitCode, string> = {
  A: "#2563eb",
  B: "#16a34a",
  C: "#ea580c",
  D: "#7c3aed",
};

export const PHASE_CHART_COLORS: Record<PhaseCode, string> = {
  attack: "#dc2626",
  defence: "#2563eb",
  trans_attack: "#d97706",
  trans_defence: "#0f766e",
};

export function colorForSeries(series: DimensionSeries): string {
  switch (series.kind) {
    case "trait":
      return isTraitCode(series.code)
        ? TRAIT_CHART_COLORS[series.code]
        : TRAIT_CHART_COLORS.A;
    case "phase":
      return isPhaseCode(series.code)
        ? PHASE_CHART_COLORS[series.code]
        : PHASE_CHART_COLORS.attack;
    default: {
      const _never: never = series.kind;
      return _never;
    }
  }
}

function compareAt(a: string, b: string): number {
  return a.localeCompare(b);
}

export function buildDimensionSeries(
  events: SeriesEvent[],
  kind: DimensionKind,
): DimensionSeries[] {
  const codes = kind === "trait" ? TRAIT_CODES : PHASE_CODES;
  const ordered = [...events].sort((left, right) =>
    compareAt(left.assessed_at, right.assessed_at),
  );

  return codes.map((code) => {
    const points: ChartPoint[] = [];
    for (const event of ordered) {
      const match = event.scores.find(
        (score) => score.dimension_kind === kind && score.dimension_code === code,
      );
      if (match) {
        points.push({ at: event.assessed_at, score: match.score });
      }
    }
    return { kind, code, points };
  });
}

/** Charts MVP: empty unless at least one dimension has two or more points. */
export function chartHasEnoughPoints(series: DimensionSeries[]): boolean {
  return series.some((item) => item.points.length >= 2);
}

export function scoreMapForKind(
  scores: { dimension_kind: DimensionKind; dimension_code: string; score: AssessmentScoreValue }[],
  kind: DimensionKind,
): Map<string, AssessmentScoreValue> {
  const map = new Map<string, AssessmentScoreValue>();
  for (const score of scores) {
    if (score.dimension_kind === kind) {
      map.set(score.dimension_code, score.score);
    }
  }
  return map;
}
