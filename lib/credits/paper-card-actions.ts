"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { creditRpcErrorKey, parseUuid, readString } from "@/lib/org/parse";
import { inspectHeadshotBuffer } from "@/lib/org/player-photos";
import { clubTodayDate } from "@/lib/org/session-calendar";
import { confirmProblem, parseUsedDates } from "@/lib/credits/paper-card";
import {
  PAPER_CARD_MODEL,
  extractPaperCard,
  isPaperCardAiConfigured,
  type CardPhoto,
} from "@/lib/credits/paper-card-ai";
import { PAPER_CARDS_BUCKET } from "@/lib/credits/paper-card-queries";
import type { PaperCheckState } from "@/lib/credits/paper-card-state";
import type { OrgActionState, OrgErrorKey } from "@/lib/org/errors";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

function localeOf(formData: FormData) {
  return parseAppLocale(readString(formData, "locale"));
}

function paperCardErrorKey(message: string): OrgErrorKey {
  if (message.includes("not authorized")) {
    return "forbidden";
  }
  if (message.includes("already confirmed")) {
    return "paperCardAlreadyConfirmed";
  }
  if (message.includes("invalid package credits")) {
    return "paperCardPackageRequired";
  }
  if (message.includes("invalid remaining")) {
    return "paperCardRemainingInvalid";
  }
  if (message.includes("invalid used date")) {
    return "paperCardFutureDate";
  }
  if (message.includes("too many used dates")) {
    return "paperCardTooManyDates";
  }
  if (message.includes("invalid photo path")) {
    return "invalidPhotoPath";
  }
  return creditRpcErrorKey({ message });
}

async function requireAdmin() {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false as const, errorKey: "notConfigured" as const };
  }
  const { user, roles } = await loadSignedInAccount();
  if (!user || !canAccessAdmin(roles)) {
    return { ok: false as const, errorKey: "forbidden" as const };
  }
  return { ok: true as const, supabase: await createClient() };
}

function revalidatePaperCards() {
  revalidatePath("/[locale]/app/admin/paper-cards", "layout");
  revalidatePath("/[locale]/app/admin/dashboard", "page");
}

function extensionOf(mime: CardPhoto["mime"]) {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

/**
 * Runs the AI read-out when configured and stores the result on the draft.
 * Any failure leaves the card on manual entry (P09-6); the flow never stops here.
 */
async function extractInto(supabase: Supabase, cardId: string, photos: CardPhoto[]) {
  if (!isPaperCardAiConfigured() || photos.length === 0) {
    await supabase.rpc("admin_save_paper_card_extraction", {
      p_card_id: cardId,
      p_extracted: null,
      p_needs_manual: true,
    });
    return;
  }
  const result = await extractPaperCard(photos, clubTodayDate());
  const { data: jobId } = await supabase.rpc("admin_record_ai_job", {
    p_kind: "paper_card_extract",
    p_model: PAPER_CARD_MODEL,
    p_input_ref: `paper_card:${cardId}`,
    p_output: result.output ?? null,
    p_status: result.status,
    p_cost_usd: result.costUsd,
  });
  if (result.status !== "succeeded") {
    await supabase.rpc("admin_save_paper_card_extraction", {
      p_card_id: cardId,
      p_extracted: { ai_job_id: jobId ?? null, status: result.status },
      p_needs_manual: true,
    });
    return;
  }
  const { extraction } = result;
  const { error } = await supabase.rpc("admin_save_paper_card_extraction", {
    p_card_id: cardId,
    p_extracted: {
      ai_job_id: jobId ?? null,
      status: result.status,
      cells: extraction.cells,
      terms_detected: extraction.termsDetected,
    },
    p_needs_manual: false,
    p_card_no: extraction.cardNo,
    p_package_credits: extraction.packageCredits,
    p_squad_marks: extraction.squadMarks,
  });
  if (error) {
    console.error("extractInto save", error.message);
  }
}

/** Step 1: new draft card from the front/back photos, then the AI read-out. */
export async function startPaperCard(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const playerId = parseUuid(readString(formData, "player_id"));
  if (!playerId) {
    return fail("playerRequired");
  }
  const sides: { side: "front" | "back"; photo: CardPhoto }[] = [];
  for (const side of ["front", "back"] as const) {
    const file = formData.get(side);
    if (!(file instanceof File) || file.size === 0) {
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspected = inspectHeadshotBuffer(bytes);
    if (!inspected.ok) {
      return fail(inspected.errorKey);
    }
    sides.push({ side, photo: { mime: inspected.mime, bytes } });
  }
  // The back carries the dates; a manual card may also start without photos.
  if (sides.length === 0 && readString(formData, "manual") !== "true") {
    return fail("paperCardPhotosRequired");
  }

  const { supabase } = actor;
  const { data: cardId, error } = await supabase.rpc("admin_create_paper_card", { p_player_id: playerId });
  if (error || !cardId) {
    console.error("startPaperCard create", error?.message);
    return fail(paperCardErrorKey(error?.message ?? ""));
  }

  const paths: string[] = [];
  for (const { side, photo } of sides) {
    const path = `${cardId}/${side}-${crypto.randomUUID()}.${extensionOf(photo.mime)}`;
    const { error: uploadError } = await supabase.storage
      .from(PAPER_CARDS_BUCKET)
      .upload(path, photo.bytes, { contentType: photo.mime, upsert: false });
    if (uploadError) {
      console.error("startPaperCard upload", uploadError.message);
      if (paths.length > 0) {
        await supabase.storage.from(PAPER_CARDS_BUCKET).remove(paths);
      }
      await supabase.rpc("admin_discard_paper_card", { p_card_id: cardId });
      return fail("generic");
    }
    paths.push(path);
  }
  if (paths.length > 0) {
    const { error: attachError } = await supabase.rpc("admin_attach_paper_card_photos", {
      p_card_id: cardId,
      p_paths: paths,
    });
    if (attachError) {
      console.error("startPaperCard attach", attachError.message);
      return fail(paperCardErrorKey(attachError.message));
    }
  }

  // "Enter by hand" skips the AI even when photos were taken (they stay for reference).
  const manual = readString(formData, "manual") === "true";
  await extractInto(supabase, cardId, manual ? [] : sides.map((row) => row.photo));
  revalidatePaperCards();
  redirect({ href: `/app/admin/paper-cards/${cardId}`, locale: localeOf(formData) });
  return { ok: true, errorKey: null };
}

/** Re-run the read-out on the stored photos of a draft. */
export async function rerunPaperCardExtraction(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const cardId = parseUuid(readString(formData, "card_id"));
  if (!cardId) {
    return fail("generic");
  }
  const { supabase } = actor;
  const { data: card } = await supabase
    .from("paper_cards")
    .select("status, photo_paths")
    .eq("id", cardId)
    .maybeSingle();
  if (!card || card.status !== "draft") {
    return fail("paperCardAlreadyConfirmed");
  }
  const photos: CardPhoto[] = [];
  for (const path of card.photo_paths) {
    const { data: blob, error } = await supabase.storage.from(PAPER_CARDS_BUCKET).download(path);
    if (error || !blob) {
      console.error("rerunPaperCardExtraction download", error?.message);
      return fail("generic");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const inspected = inspectHeadshotBuffer(bytes);
    if (inspected.ok) {
      photos.push({ mime: inspected.mime, bytes });
    }
  }
  await extractInto(supabase, cardId, photos);
  revalidatePaperCards();
  redirect({ href: `/app/admin/paper-cards/${cardId}`, locale: localeOf(formData) });
  return { ok: true, errorKey: null };
}

/** Remove the photos through the Storage API, then clear the paths (P09-4). */
async function purgePhotos(supabase: Supabase, cardId: string, paths: readonly string[]): Promise<boolean> {
  if (paths.length > 0) {
    const { error } = await supabase.storage.from(PAPER_CARDS_BUCKET).remove([...paths]);
    if (error) {
      console.error("purgePhotos remove", error.message);
      return false;
    }
  }
  const { error } = await supabase.rpc("admin_purge_paper_card_photos", { p_card_id: cardId });
  if (error) {
    console.error("purgePhotos clear", error.message);
    return false;
  }
  return true;
}

/** Step 2: staff checked every cell; move the card into the ledger. */
export async function confirmPaperCard(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const cardId = parseUuid(readString(formData, "card_id"));
  if (!cardId) {
    return fail("generic");
  }
  const packageRaw = Number.parseInt(readString(formData, "package_credits"), 10);
  const remainingRaw = readString(formData, "remaining");
  const remaining = /^\d+$/.test(remainingRaw) ? Number.parseInt(remainingRaw, 10) : null;
  const usedDates = parseUsedDates(
    formData.getAll("used_date").map((value) => (typeof value === "string" ? value : "")),
  );
  const problem = confirmProblem({
    packageCredits: Number.isFinite(packageRaw) ? packageRaw : null,
    remaining,
    usedDates,
    today: clubTodayDate(),
  });
  if (problem) {
    const keys: Record<NonNullable<typeof problem>, OrgErrorKey> = {
      packageRequired: "paperCardPackageRequired",
      remainingOutOfRange: "paperCardRemainingInvalid",
      futureDate: "paperCardFutureDate",
      tooManyDates: "paperCardTooManyDates",
    };
    return fail(keys[problem]);
  }

  const { supabase } = actor;
  const { data, error } = await supabase.rpc("admin_confirm_paper_card", {
    p_card_id: cardId,
    p_card_no: readString(formData, "card_no") || null,
    p_package_credits: packageRaw,
    p_used_dates: usedDates,
    p_remaining: remaining ?? 0,
  });
  if (error) {
    console.error("confirmPaperCard", error.message);
    return fail(paperCardErrorKey(error.message));
  }
  const result = (data ?? {}) as Record<string, unknown>;
  const paths = Array.isArray(result.photo_paths) ? (result.photo_paths as string[]) : [];
  const purged = await purgePhotos(supabase, cardId, paths);

  revalidatePaperCards();
  revalidatePath("/[locale]/app/credits", "page");
  const query = new URLSearchParams({
    done: cardId,
    matched: String(result.matched ?? 0),
    unmatched: String(result.unmatched ?? 0),
    reversed: String(result.reversed ?? 0),
    balance: String(result.credits_available ?? ""),
    ...(purged ? {} : { photos: "kept" }),
  });
  redirect({ href: `/app/admin/paper-cards?${query.toString()}`, locale: localeOf(formData) });
  return { ok: true, errorKey: null };
}

/** Retry for a confirmed card whose photos are still stored. */
export async function retryPaperCardPhotoPurge(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const cardId = parseUuid(readString(formData, "card_id"));
  if (!cardId) {
    return fail("generic");
  }
  const { data: card } = await actor.supabase
    .from("paper_cards")
    .select("photo_paths")
    .eq("id", cardId)
    .maybeSingle();
  if (!card || !(await purgePhotos(actor.supabase, cardId, card.photo_paths))) {
    return fail("generic");
  }
  revalidatePaperCards();
  redirect({ href: "/app/admin/paper-cards", locale: localeOf(formData) });
  return { ok: true, errorKey: null };
}

export async function discardPaperCard(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const actor = await requireAdmin();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }
  const cardId = parseUuid(readString(formData, "card_id"));
  if (!cardId) {
    return fail("generic");
  }
  const { data: paths, error } = await actor.supabase.rpc("admin_discard_paper_card", { p_card_id: cardId });
  if (error) {
    console.error("discardPaperCard", error.message);
    return fail(paperCardErrorKey(error.message));
  }
  if (paths && paths.length > 0) {
    const { error: removeError } = await actor.supabase.storage.from(PAPER_CARDS_BUCKET).remove(paths);
    if (removeError) {
      console.error("discardPaperCard remove", removeError.message);
    }
  }
  revalidatePaperCards();
  redirect({ href: "/app/admin/paper-cards", locale: localeOf(formData) });
  return { ok: true, errorKey: null };
}

/** Weekly parallel check (D7): card remaining vs system; a mismatch opens a task. */
export async function recordPaperCardCheck(_prev: PaperCheckState, formData: FormData): Promise<PaperCheckState> {
  const failed = (errorKey: OrgErrorKey): PaperCheckState => ({
    errorKey,
    cardRemaining: null,
    systemRemaining: null,
    matches: null,
  });
  const actor = await requireAdmin();
  if (!actor.ok) {
    return failed(actor.errorKey);
  }
  const playerId = parseUuid(readString(formData, "player_id"));
  if (!playerId) {
    return failed("playerRequired");
  }
  const raw = readString(formData, "card_remaining");
  const cardRemaining = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;
  if (cardRemaining === null || cardRemaining > 30) {
    return failed("paperCardRemainingInvalid");
  }
  const { data, error } = await actor.supabase.rpc("staff_record_paper_card_check", {
    p_player_id: playerId,
    p_card_remaining: cardRemaining,
    p_note: readString(formData, "note") || null,
  });
  if (error) {
    console.error("recordPaperCardCheck", error.message);
    return failed(paperCardErrorKey(error.message));
  }
  const result = (data ?? {}) as Record<string, unknown>;
  revalidatePaperCards();
  revalidatePath("/[locale]/app/admin", "page");
  return {
    errorKey: null,
    cardRemaining,
    systemRemaining: typeof result.system_remaining === "number" ? result.system_remaining : null,
    matches: typeof result.matches === "boolean" ? result.matches : null,
  };
}
