import { parseIsoDate } from "@/lib/age-band";
import type { AgeBand, OrgStatus } from "@/lib/supabase/database.types";
import { isAgeBand } from "@/lib/age-band";

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

export function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) {
    return false;
  }
  if (error.code === "23505") {
    return true;
  }
  return (error.message ?? "").toLowerCase().includes("duplicate key");
}

export function isJerseyUniqueViolation(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!isUniqueViolation(error)) {
    return false;
  }
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("team_memberships_team_jersey") ||
    message.includes("jersey_number") ||
    message.includes("(team_id, jersey_number)")
  );
}
