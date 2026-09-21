// Relative imports so `npm test` can load this file without the `@/` alias.
import { parseBirthDate, parseUuid, readString } from "../org/parse.ts";
import {
  MAX_ASSESSMENT_NOTE,
  PHASE_CODES,
  TRAIT_CODES,
  isAssessmentScoreValue,
  isDimensionKind,
  isPhaseCode,
  isTraitCode,
  phaseFromStage5Situation,
  scoreFieldName,
  traitCodeFromStage5Trait,
  type AssessmentDimensionScore,
  type AssessmentItem,
  type AssessmentScoreValue,
  type AssessmentSituations,
  type AssessmentTraits,
  type DimensionKind,
  type PhaseCode,
  type SituationKey,
  type TraitCode,
  type TraitKey,
} from "./model.ts";

export type AssessmentParseErrorKey =
  | "missingPlayer"
  | "invalidAssessedOn"
  | "futureAssessedOn"
  | "invalidScore"
  | "missingScore"
  | "noteTooLong"
  | "sessionNotFound";

export type ParsedAssessmentEventPayload = {
  playerId: string;
  assessedOn: string;
  note: string | null;
  sessionId: string | null;
  scores: AssessmentDimensionScore[];
};

export type AssessmentParseResult =
  | { ok: true; payload: ParsedAssessmentEventPayload }
  | { ok: false; errorKey: AssessmentParseErrorKey };

export function parseAssessmentScore(value: string): AssessmentScoreValue | null {
  if (!/^[1-5]$/.test(value.trim())) {
    return null;
  }
  const n = Number(value.trim());
  return isAssessmentScoreValue(n) ? n : null;
}

export function parseOptionalAssessmentScore(
  value: string,
): AssessmentScoreValue | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const score = parseAssessmentScore(trimmed);
  return score === null ? "invalid" : score;
}

export function parseAssessmentNote(
  value: string,
): string | null | "too_long" {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_ASSESSMENT_NOTE) {
    return "too_long";
  }
  return trimmed;
}

function readOptionalScore(
  formData: FormData,
  kind: DimensionKind,
  code: TraitCode | PhaseCode,
):
  | { ok: true; score: AssessmentScoreValue | null }
  | { ok: false; errorKey: AssessmentParseErrorKey } {
  const raw = parseOptionalAssessmentScore(
    readString(formData, scoreFieldName(kind, code)),
  );
  if (raw === "invalid") {
    return { ok: false, errorKey: "invalidScore" };
  }
  return { ok: true, score: raw };
}

export function parseAssessmentEventFormData(
  formData: FormData,
  todayIso: string,
): AssessmentParseResult {
  const playerId = parseUuid(readString(formData, "player_id"));
  if (!playerId) {
    return { ok: false, errorKey: "missingPlayer" };
  }

  const assessedRaw = readString(formData, "assessed_on");
  const assessedOn = parseBirthDate(assessedRaw, todayIso);
  if (assessedOn === "future") {
    return { ok: false, errorKey: "futureAssessedOn" };
  }
  if (!assessedOn) {
    return { ok: false, errorKey: "invalidAssessedOn" };
  }

  const note = parseAssessmentNote(readString(formData, "note"));
  if (note === "too_long") {
    return { ok: false, errorKey: "noteTooLong" };
  }

  const sessionRaw = readString(formData, "session_id");
  let sessionId: string | null = null;
  if (sessionRaw) {
    sessionId = parseUuid(sessionRaw);
    if (!sessionId) {
      return { ok: false, errorKey: "sessionNotFound" };
    }
  }

  const scores: AssessmentDimensionScore[] = [];

  for (const code of TRAIT_CODES) {
    const parsed = readOptionalScore(formData, "trait", code);
    if (!parsed.ok) {
      return parsed;
    }
    if (parsed.score !== null) {
      scores.push({
        dimension_kind: "trait",
        dimension_code: code,
        score: parsed.score,
      });
    }
  }

  for (const code of PHASE_CODES) {
    const parsed = readOptionalScore(formData, "phase", code);
    if (!parsed.ok) {
      return parsed;
    }
    if (parsed.score !== null) {
      scores.push({
        dimension_kind: "phase",
        dimension_code: code,
        score: parsed.score,
      });
    }
  }

  if (scores.length === 0) {
    return { ok: false, errorKey: "missingScore" };
  }

  return {
    ok: true,
    payload: {
      playerId,
      assessedOn,
      note,
      sessionId,
      scores,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseStoredAssessmentItem(value: unknown): AssessmentItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const score =
    typeof value.score === "number"
      ? value.score
      : typeof value.score === "string"
        ? Number(value.score)
        : NaN;
  if (!isAssessmentScoreValue(score)) {
    return null;
  }
  if (value.note == null) {
    return { score, note: null };
  }
  if (typeof value.note !== "string") {
    return null;
  }
  const note = parseAssessmentNote(value.note);
  if (note === "too_long") {
    return null;
  }
  return { score, note };
}

export function parseStoredSituations(value: unknown): AssessmentSituations | null {
  if (!isRecord(value)) {
    return null;
  }
  const result = {} as AssessmentSituations;
  const keys: SituationKey[] = [
    "attack",
    "defense",
    "attack_to_defense",
    "defense_to_attack",
  ];
  for (const key of keys) {
    const item = parseStoredAssessmentItem(value[key]);
    if (!item) {
      return null;
    }
    result[key] = item;
  }
  return result;
}

export function parseStoredTraits(value: unknown): AssessmentTraits | null {
  if (!isRecord(value)) {
    return null;
  }
  const result = {} as AssessmentTraits;
  const keys: TraitKey[] = [
    "adaptability",
    "resilience",
    "coachability",
    "team_commitment",
  ];
  for (const key of keys) {
    const item = parseStoredAssessmentItem(value[key]);
    if (!item) {
      return null;
    }
    result[key] = item;
  }
  return result;
}

export function mapStage5SnapshotToScores(
  situations: AssessmentSituations,
  traits: AssessmentTraits,
): AssessmentDimensionScore[] {
  const scores: AssessmentDimensionScore[] = [];
  const situationKeys: SituationKey[] = [
    "attack",
    "defense",
    "attack_to_defense",
    "defense_to_attack",
  ];
  for (const key of situationKeys) {
    scores.push({
      dimension_kind: "phase",
      dimension_code: phaseFromStage5Situation(key),
      score: situations[key].score,
    });
  }
  const traitKeys: TraitKey[] = [
    "adaptability",
    "resilience",
    "coachability",
    "team_commitment",
  ];
  for (const key of traitKeys) {
    scores.push({
      dimension_kind: "trait",
      dimension_code: traitCodeFromStage5Trait(key),
      score: traits[key].score,
    });
  }
  return scores;
}

export function parseStoredDimensionScore(
  value: unknown,
): AssessmentDimensionScore | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind = value.dimension_kind;
  const code = value.dimension_code;
  if (typeof kind !== "string" || !isDimensionKind(kind)) {
    return null;
  }
  if (typeof code !== "string") {
    return null;
  }
  let dimensionCode: TraitCode | PhaseCode;
  switch (kind) {
    case "trait":
      if (!isTraitCode(code)) {
        return null;
      }
      dimensionCode = code;
      break;
    case "phase":
      if (!isPhaseCode(code)) {
        return null;
      }
      dimensionCode = code;
      break;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
  const score =
    typeof value.score === "number"
      ? value.score
      : typeof value.score === "string"
        ? Number(value.score)
        : NaN;
  if (!isAssessmentScoreValue(score)) {
    return null;
  }
  return {
    dimension_kind: kind,
    dimension_code: dimensionCode,
    score,
  };
}

type PgLikeError = {
  code?: string;
  message?: string;
  details?: string;
} | null;

function errorBlob(error: PgLikeError): string {
  if (!error) {
    return "";
  }
  return `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
}

export type AssessmentRpcErrorKey =
  | "forbidden"
  | "missingPlayer"
  | "assessmentNotFound"
  | "futureAssessedOn"
  | "invalidScore"
  | "missingScore"
  | "sessionNotFound"
  | "noteTooLong"
  | "generic";

export function assessmentRpcErrorKey(error: PgLikeError): AssessmentRpcErrorKey {
  const text = errorBlob(error);
  if (text.includes("player not found")) {
    return "missingPlayer";
  }
  if (text.includes("assessment not found")) {
    return "assessmentNotFound";
  }
  if (text.includes("session not found")) {
    return "sessionNotFound";
  }
  if (text.includes("assessed_on cannot be in the future")) {
    return "futureAssessedOn";
  }
  if (text.includes("note too long")) {
    return "noteTooLong";
  }
  if (text.includes("requires at least one score")) {
    return "missingScore";
  }
  if (
    text.includes("invalid situations") ||
    text.includes("invalid traits") ||
    text.includes("invalid score") ||
    text.includes("player_assessments_situations_valid") ||
    text.includes("player_assessments_traits_valid")
  ) {
    return "invalidScore";
  }
  if (text.includes("not authorized")) {
    return "forbidden";
  }
  return "generic";
}
