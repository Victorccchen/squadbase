"use server";

import { revalidatePath } from "next/cache";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { parseUuid, readString } from "@/lib/org/parse";
import type { OrgActionState, OrgErrorKey } from "@/lib/org/errors";
import { nextTaipeiMorning, parseTaskDecision } from "@/lib/tasks/model";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

/** Inbox buttons: mark done, dismiss, or snooze until 08:00 Taipei tomorrow. */
export async function decideTask(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return fail("notConfigured");
  }
  const { user, roles } = await loadSignedInAccount();
  if (!user || !canAccessAdmin(roles)) {
    return fail("forbidden");
  }

  const taskId = parseUuid(readString(formData, "task_id"));
  const decision = parseTaskDecision(readString(formData, "decision"));
  if (!taskId || !decision) {
    return fail("generic");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_task_status", {
    p_task_id: taskId,
    p_status: decision,
    p_snoozed_until: decision === "snoozed" ? nextTaipeiMorning(new Date()).toISOString() : null,
  });

  if (error) {
    console.error("decideTask", error.message);
    return fail(error.message.includes("not authorized") ? "forbidden" : "generic");
  }

  revalidatePath("/[locale]/app/admin", "page");
  return { ok: true, errorKey: null };
}
