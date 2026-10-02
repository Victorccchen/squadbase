"use server";

import { revalidatePath } from "next/cache";
import { getPublicSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { parseCheckinResults, isCheckinToken } from "@/lib/checkin/model";
import type { CheckinActionState } from "@/lib/checkin/state";
import { parseUuid, readString } from "@/lib/org/parse";
import type { OrgErrorKey } from "@/lib/org/errors";

function checkinErrorKey(message: string): OrgErrorKey {
  if (message.includes("not an approved guardian") || message.includes("not authorized")) {
    return "forbidden";
  }
  if (message.includes("invalid checkin token")) {
    return "checkinTokenInvalid";
  }
  if (message.includes("no players selected")) {
    return "checkinNoChild";
  }
  return "generic";
}

/** PR-07: parent checks in the selected children at the venue's open session. */
export async function parentCheckin(
  _prev: CheckinActionState,
  formData: FormData,
): Promise<CheckinActionState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { errorKey: "notConfigured", results: [] };
  }
  const token = readString(formData, "token");
  if (!isCheckinToken(token)) {
    return { errorKey: "checkinTokenInvalid", results: [] };
  }
  const playerIds = formData
    .getAll("player_id")
    .map((value) => parseUuid(typeof value === "string" ? value : ""))
    .filter((value): value is string => Boolean(value));
  if (playerIds.length === 0) {
    return { errorKey: "checkinNoChild", results: [] };
  }
  const sessionId = parseUuid(readString(formData, "session_id"));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("parent_checkin", {
    p_token: token,
    p_player_ids: playerIds,
    p_session_id: sessionId,
  });
  if (error) {
    console.error("parentCheckin", error.message);
    return { errorKey: checkinErrorKey(error.message), results: [] };
  }

  revalidatePath("/[locale]/app/credits", "page");
  return { errorKey: null, results: parseCheckinResults(data) };
}
