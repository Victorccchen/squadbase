import { createClient } from "@/lib/supabase/server";
import type { ParentNotice } from "@/lib/supabase/database.types";

/** PR-07: recent notices about the parent's children (RLS: approved guardian). */
export async function listOwnParentNotices(playerIds: string[]): Promise<ParentNotice[]> {
  if (playerIds.length === 0) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parent_notices")
    .select("*")
    .in("player_id", playerIds)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("listOwnParentNotices", error.message);
    return [];
  }
  return (data ?? []) as ParentNotice[];
}

/** Template values for attendance.staff_backfill (messages: credits.backfillNotice). */
export function backfillNoticeValues(notice: ParentNotice): {
  date: string;
  debited: number;
  remaining: number;
} {
  const params = notice.params ?? {};
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return {
    date: typeof params.session_date === "string" ? params.session_date : "",
    debited: num(params.credits_debited),
    remaining: num(params.credits_available),
  };
}
