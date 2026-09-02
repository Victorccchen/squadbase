// Relative imports so `npm test` can load this file without the `@/` alias.
import { isAgeBand, parseIsoDate } from "../age-band.ts";
import type { AgeBand, OrgStatus } from "../supabase/database.types.ts";

export function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseOrgStatus(value: string): OrgStatus | null {
  if (value === "active" || value === "inactive") {
    return value;
  }
  return null;
}

export function parseAgeBand(value: string): AgeBand | null {
  return isAgeBand(value) ? value : null;
}

export function parseJersey(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) {
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    return null;
  }
  return n;
}

export function optionalTrimmed(value: string): string | null {
  return value.length > 0 ? value : null;
}

export type ParsedPlayerNames = {
  nameZh: string | null;
  nameEnGiven: string;
  nameEnFamily: string;
  nameJa: string | null;
};

export type PlayerNameErrorKey = "invalidName" | "missingCjkName";

export function parsePlayerNames(formData: FormData): ParsedPlayerNames {
  return {
    nameZh: optionalTrimmed(readString(formData, "name_zh")),
    nameEnGiven: readString(formData, "name_en_given"),
    nameEnFamily: readString(formData, "name_en_family"),
    nameJa: optionalTrimmed(readString(formData, "name_ja")),
  };
}

export function playerNamesError(names: ParsedPlayerNames): PlayerNameErrorKey | null {
  if (!names.nameEnGiven || !names.nameEnFamily) {
    return "invalidName";
  }
  if (!names.nameZh && !names.nameJa) {
    return "missingCjkName";
  }
  return null;
}

export function parseBirthDate(value: string, todayIso: string): string | "future" | null {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return null;
  }
  if (value > todayIso) {
    return "future";
  }
  return value;
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

export function isUniqueViolation(error: PgLikeError): boolean {
  if (!error) {
    return false;
  }
  if (error.code === "23505") {
    return true;
  }
  return errorBlob(error).includes("duplicate key");
}

export function isJerseyUniqueViolation(error: PgLikeError): boolean {
  if (!isUniqueViolation(error)) {
    return false;
  }
  const text = errorBlob(error);
  return (
    text.includes("team_memberships_team_jersey") ||
    text.includes("jersey_number") ||
    text.includes("(team_id, jersey_number)")
  );
}

export function isPlayersCjkNameCheckViolation(error: PgLikeError): boolean {
  if (!error) {
    return false;
  }
  if (error.code !== "23514" && !errorBlob(error).includes("check constraint")) {
    return false;
  }
  return errorBlob(error).includes("players_name_zh_or_ja_present");
}
