import type { AppRole } from "@/lib/supabase/database.types";

export const DASHBOARD_ROLES = ["parent", "coach", "admin"] as const;
export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export function isDashboardRole(role: AppRole): role is DashboardRole {
  return role === "parent" || role === "coach" || role === "admin";
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

export function canAccessRoster(roles: AppRole[]): boolean {
  return hasRole(roles, "coach") || hasRole(roles, "admin");
}

export function canReviewPayments(roles: AppRole[]): boolean {
  return hasRole(roles, "admin");
}

export function canTakeAttendance(roles: AppRole[]): boolean {
  return hasRole(roles, "coach") || hasRole(roles, "admin");
}
