import type { AppRole } from "@/lib/supabase/database.types";

export const DASHBOARD_ROLES = ["parent", "coach", "admin", "director"] as const;
export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export function isDashboardRole(role: AppRole): role is DashboardRole {
  return (DASHBOARD_ROLES as readonly string[]).includes(role);
}

export function uniqueRoles(roles: AppRole[]): AppRole[] {
  return Array.from(new Set(roles));
}

export function hasRole(roles: AppRole[], role: AppRole): boolean {
  return roles.includes(role);
}

export function canAccessAdmin(roles: AppRole[]): boolean {
  return hasRole(roles, "admin");
}

/** PR-08b: the youth director (or staff) takes cash, closes the day and records deposits. */
export function canHandleCash(roles: AppRole[]): boolean {
  return hasRole(roles, "director") || hasRole(roles, "admin");
}

export function canAccessRoster(roles: AppRole[]): boolean {
  return hasRole(roles, "coach") || hasRole(roles, "admin");
}

/** Attendance debits credits, so only staff (admin) mark it; coaches do not (Phase 1 PR-04). */
export function canTakeAttendance(roles: AppRole[]): boolean {
  return hasRole(roles, "admin");
}

export function canWriteAssessments(roles: AppRole[]): boolean {
  return hasRole(roles, "coach") || hasRole(roles, "admin");
}
