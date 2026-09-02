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
