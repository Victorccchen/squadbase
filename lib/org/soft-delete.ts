import { canAccessAdmin } from "../auth/roles.ts";
import type { AppRole } from "../supabase/database.types.ts";

export function isSoftDeleted(row: { deleted_at?: string | null }): boolean {
  return row.deleted_at != null && row.deleted_at !== "";
}

/** Default admin session/match lists hide soft-deleted rows unless includeDeleted is on. */
export function filterDefaultAdminList<T extends { deleted_at?: string | null }>(
  rows: readonly T[],
  includeDeleted = false,
): T[] {
  if (includeDeleted) {
    return [...rows];
  }
  return rows.filter((row) => !isSoftDeleted(row));
}

/** Parent training/competition default lists never include soft-deleted rows. */
export function filterParentDefaultList<T extends { deleted_at?: string | null }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => !isSoftDeleted(row));
}

/** Same gate as existing session soft-delete and match cancel: admin only. */
export function canSoftDeleteOrgRecords(roles: readonly AppRole[]): boolean {
  return canAccessAdmin([...roles]);
}
