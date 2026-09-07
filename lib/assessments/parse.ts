// Relative imports so `npm test` can load this file without the `@/` alias.
import { parseBirthDate, parseUuid, readString } from "../org/parse.ts";
import {
  MAX_ASSESSMENT_NOTE,
  SITUATION_KEYS,
  TRAIT_KEYS,
  isAssessmentScoreValue,
  type AssessmentItem,
  type AssessmentScoreValue,
  type AssessmentSituations,
  type AssessmentTraits,
  type SituationKey,
  type TraitKey,
} from "./model.ts";

export type AssessmentParseErrorKey =
  | "missingPlayer"
  | "invalidAssessedOn"
  | "futureAssessedOn"
  | "invalidScore"
  | "noteTooLong";

export type ParsedAssessmentPayload = {
  playerId: string;
  assessedOn: string;
  situations: AssessmentSituations;
  traits: AssessmentTraits;
};

export type AssessmentParseResult =
  | { ok: true; payload: ParsedAssessmentPayload }
  | { ok: false; errorKey: AssessmentParseErrorKey };

export function parseAssessmentScore(value: string): AssessmentScoreValue | null {
  if (!/^[1-5]$/.test(value.trim())) {
    return null;
  }
  const n = Number(value.trim());
  return isAssessmentScoreValue(n) ? n : null;
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

function parseItem(
  formData: FormData,
  prefix: "sit" | "trait",
  key: SituationKey | TraitKey,
): { ok: true; item: AssessmentItem } | { ok: false; errorKey: AssessmentParseErrorKey } {
  const score = parseAssessmentScore(readString(formData, `${prefix}_${key}_score`));
  if (score === null) {
    return { ok: false, errorKey: "invalidScore" };
  }
  const note = parseAssessmentNote(readString(formData, `${prefix}_${key}_note`));
  if (note === "too_long") {
    return { ok: false, errorKey: "noteTooLong" };
  }
  return { ok: true, item: { score, note } };
}

export function parseAssessmentFormData(
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

  const situations = {} as AssessmentSituations;
  for (const key of SITUATION_KEYS) {
    const parsed = parseItem(formData, "sit", key);
    if (!parsed.ok) {
      return parsed;
    }
    situations[key] = parsed.item;
  }

  const traits = {} as AssessmentTraits;
  for (const key of TRAIT_KEYS) {
    const parsed = parseItem(formData, "trait", key);
    if (!parsed.ok) {
      return parsed;
    }
    traits[key] = parsed.item;
  }

  return {
    ok: true,
    payload: {
      playerId,
      assessedOn,
      situations,
      traits,
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
  for (const key of SITUATION_KEYS) {
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
  for (const key of TRAIT_KEYS) {
    const item = parseStoredAssessmentItem(value[key]);
    if (!item) {
      return null;
    }
    result[key] = item;
  }
  return result;
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
  | "generic";

export function assessmentRpcErrorKey(error: PgLikeError): AssessmentRpcErrorKey {
  const text = errorBlob(error);
  if (text.includes("player not found")) {
    return "missingPlayer";
  }
  if (text.includes("assessment not found")) {
    return "assessmentNotFound";
  }
  if (text.includes("assessed_on cannot be in the future")) {
    return "futureAssessedOn";
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
