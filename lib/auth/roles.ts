import type { AppRole } from "@/lib/supabase/database.types";

export const DASHBOARD_ROLES = ["parent", "coach", "admin"] as const;
export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export function isDashboardRole(role: AppRole): role is DashboardRole {
  return role === "parent" || role === "coach" || role === "admin";
}

export function uniqueRoles(roles: AppRole[]): AppRole[] {
  return Array.from(new Set(roles));
}
