import type { SessionKind } from "@/lib/supabase/database.types";

/** Calendar-dot and legend colors (CSS tokens in app/globals.css). */
export const SESSION_KIND_DOT_CLASS: Record<SessionKind, string> = {
  regular: "bg-session-regular",
  special: "bg-session-special",
  cup: "bg-session-cup",
  league: "bg-session-league",
};

export const SESSION_KIND_BADGE_CLASS: Record<SessionKind, string> = {
  regular:
    "bg-session-regular/15 text-blue-900 dark:bg-session-regular/25 dark:text-blue-100",
  special:
    "bg-session-special/20 text-amber-950 dark:bg-session-special/25 dark:text-amber-100",
  cup: "bg-session-cup/15 text-purple-950 dark:bg-session-cup/25 dark:text-purple-100",
  league:
    "bg-session-league/15 text-green-950 dark:bg-session-league/25 dark:text-green-100",
};
