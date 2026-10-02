"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseUuid } from "@/lib/org/parse";

/** PR-07: parent marks backfill notices as read. */
export async function markNoticesRead(formData: FormData): Promise<void> {
  const ids = formData
    .getAll("notice_id")
    .map((value) => parseUuid(typeof value === "string" ? value : ""))
    .filter((value): value is string => Boolean(value));
  if (ids.length === 0) {
    return;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_parent_notices_read", { p_notice_ids: ids });
  if (error) {
    console.error("markNoticesRead", error.message);
  }
  revalidatePath("/[locale]/app/credits", "page");
}
