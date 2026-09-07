"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canWriteAssessments } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { formatIsoDate, todayInClubTimeZone } from "@/lib/age-band";
import { assessmentRpcErrorKey, parseAssessmentFormData } from "@/lib/assessments/parse";
import { parseUuid, readString } from "@/lib/org/parse";
import { type OrgActionState, type OrgErrorKey } from "@/lib/org/errors";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

function ok(): OrgActionState {
  return { ok: true, errorKey: null };
}

function localeFromForm(formData: FormData) {
  return parseAppLocale(readString(formData, "locale"));
}

function revalidateAssessments() {
  revalidatePath("/", "layout");
}

type AssessmentHref =
  | "/app/assessments"
  | `/app/assessments/${string}`
  | `/app/assessments/${string}/${string}`;

function redirectAssessment(href: AssessmentHref, formData: FormData) {
  redirect({ href, locale: localeFromForm(formData) });
}

async function requireStaffWriter() {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false as const, errorKey: "notConfigured" as const };
  }
  const account = await loadSignedInAccount();
  if (!account.user || !canWriteAssessments(account.roles)) {
    return { ok: false as const, errorKey: "forbidden" as const };
  }
  return { ok: true as const, ...account, supabase: await createClient() };
}

export async function createPlayerAssessment(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireStaffWriter();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const parsed = parseAssessmentFormData(
    formData,
    formatIsoDate(todayInClubTimeZone()),
  );
  if (!parsed.ok) {
    return fail(parsed.errorKey);
  }

  const { error } = await actor.supabase.rpc("create_player_assessment", {
    p_player_id: parsed.payload.playerId,
    p_assessed_on: parsed.payload.assessedOn,
    p_situations: parsed.payload.situations,
    p_traits: parsed.payload.traits,
  });

  if (error) {
    console.error("createPlayerAssessment", error.message);
    return fail(assessmentRpcErrorKey(error));
  }

  revalidateAssessments();
  redirectAssessment(`/app/assessments/${parsed.payload.playerId}`, formData);
  return ok();
}

export async function updatePlayerAssessment(
  assessmentId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireStaffWriter();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const id = parseUuid(assessmentId);
  if (!id) {
    return fail("assessmentNotFound");
  }

  const parsed = parseAssessmentFormData(
    formData,
    formatIsoDate(todayInClubTimeZone()),
  );
  if (!parsed.ok) {
    return fail(parsed.errorKey);
  }

  const { error } = await actor.supabase.rpc("update_player_assessment", {
    p_id: id,
    p_assessed_on: parsed.payload.assessedOn,
    p_situations: parsed.payload.situations,
    p_traits: parsed.payload.traits,
  });

  if (error) {
    console.error("updatePlayerAssessment", error.message);
    return fail(assessmentRpcErrorKey(error));
  }

  revalidateAssessments();
  redirectAssessment(
    `/app/assessments/${parsed.payload.playerId}/${id}`,
    formData,
  );
  return ok();
}

export async function deletePlayerAssessment(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireStaffWriter();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const assessmentId = parseUuid(readString(formData, "assessment_id"));
  const playerId = parseUuid(readString(formData, "player_id"));
  if (!assessmentId) {
    return fail("assessmentNotFound");
  }
  if (!playerId) {
    return fail("missingPlayer");
  }

  const { error } = await actor.supabase.rpc("delete_player_assessment", {
    p_id: assessmentId,
  });

  if (error) {
    console.error("deletePlayerAssessment", error.message);
    return fail(assessmentRpcErrorKey(error));
  }

  revalidateAssessments();
  redirectAssessment(`/app/assessments/${playerId}`, formData);
  return ok();
}
