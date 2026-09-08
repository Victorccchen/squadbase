"use server";

import { revalidatePath } from "next/cache";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin, hasRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { parseUuid, readString } from "@/lib/org/parse";
import {
  PLAYER_PHOTOS_BUCKET,
  assertPathBelongsToPlayer,
  canWritePlayerPhoto,
  inspectHeadshotBuffer,
  inspectIdPdfBuffer,
  nextHeadshotPath,
  nextIdPdfPath,
  writeDeniedErrorKey,
} from "@/lib/org/player-photos";
import { type OrgActionState, type OrgErrorKey } from "@/lib/org/errors";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

function ok(): OrgActionState {
  return { ok: true, errorKey: null };
}

type PhotoClient = Awaited<ReturnType<typeof createClient>>;

type WriterResult =
  | { ok: true; supabase: PhotoClient; playerId: string }
  | { ok: false; errorKey: OrgErrorKey };

function revalidatePlayerPhotos() {
  revalidatePath("/", "layout");
}

function photoRpcErrorKey(message: string | undefined): OrgErrorKey {
  const blob = (message ?? "").toLowerCase();
  if (blob.includes("not authorized")) {
    return "forbidden";
  }
  if (blob.includes("player not found")) {
    return "missingPlayer";
  }
  if (blob.includes("invalid photo path")) {
    return "invalidPhotoPath";
  }
  return "generic";
}

async function requirePhotoWriter(formData: FormData): Promise<WriterResult> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false, errorKey: "notConfigured" };
  }

  const playerId = parseUuid(readString(formData, "player_id"));
  if (!playerId) {
    return { ok: false, errorKey: "missingPlayer" };
  }

  const { roles } = await loadSignedInAccount();
  const supabase = await createClient();
  const isAdmin = canAccessAdmin(roles);
  const { data: guardian, error: guardianError } = await supabase.rpc(
    "is_approved_guardian_for_player",
    { p_player_id: playerId },
  );
  if (guardianError) {
    console.error("requirePhotoWriter guardian", guardianError.message);
    return { ok: false, errorKey: "generic" };
  }

  const { data: coach, error: coachError } = await supabase.rpc("coach_can_read_player", {
    p_player_id: playerId,
  });
  if (coachError) {
    console.error("requirePhotoWriter coach", coachError.message);
  }

  const authz = {
    isAdmin,
    isApprovedGuardian: Boolean(guardian),
    isAssignedCoach: Boolean(coach),
  };
  if (!canWritePlayerPhoto(authz)) {
    return {
      ok: false,
      errorKey: hasRole(roles, "parent") ? writeDeniedErrorKey(authz) : "forbidden",
    };
  }

  return { ok: true, supabase, playerId };
}

async function readUploadBytes(
  formData: FormData,
  field: string,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; errorKey: OrgErrorKey } | { ok: true; bytes: null }> {
  const value = formData.get(field);
  if (value == null || value === "") {
    return { ok: true, bytes: null };
  }
  if (!(value instanceof File)) {
    return { ok: false, errorKey: "invalidPhotoType" };
  }
  if (value.size === 0) {
    return { ok: true, bytes: null };
  }
  const buffer = new Uint8Array(await value.arrayBuffer());
  return { ok: true, bytes: buffer };
}

async function removeStorageObject(supabase: PhotoClient, path: string | null | undefined) {
  const trimmed = path?.trim();
  if (!trimmed) {
    return;
  }
  const { error } = await supabase.storage.from(PLAYER_PHOTOS_BUCKET).remove([trimmed]);
  if (error) {
    console.error("removeStorageObject", error.message);
  }
}

export async function uploadPlayerHeadshot(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requirePhotoWriter(formData);
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const uploaded = await readUploadBytes(formData, "headshot");
  if (!uploaded.ok) {
    return fail(uploaded.errorKey);
  }
  if (!uploaded.bytes) {
    return fail("invalidPhotoType");
  }

  const inspected = inspectHeadshotBuffer(uploaded.bytes);
  if (!inspected.ok) {
    return fail(inspected.errorKey);
  }

  const { data: player, error: loadError } = await actor.supabase
    .from("players")
    .select("photo_path")
    .eq("id", actor.playerId)
    .maybeSingle();
  if (loadError) {
    console.error("uploadPlayerHeadshot load", loadError.message);
    return fail("generic");
  }
  if (!player) {
    return fail("missingPlayer");
  }

  const path = nextHeadshotPath(actor.playerId, inspected.mime);
  const pathError = assertPathBelongsToPlayer(path, actor.playerId);
  if (pathError) {
    return fail(pathError);
  }

  const { error: uploadError } = await actor.supabase.storage
    .from(PLAYER_PHOTOS_BUCKET)
    .upload(path, uploaded.bytes, {
      contentType: inspected.mime,
      upsert: false,
    });
  if (uploadError) {
    console.error("uploadPlayerHeadshot storage", uploadError.message);
    return fail("generic");
  }

  const { error: rpcError } = await actor.supabase.rpc("set_player_headshot", {
    p_player_id: actor.playerId,
    p_photo_path: path,
  });
  if (rpcError) {
    await removeStorageObject(actor.supabase, path);
    console.error("uploadPlayerHeadshot rpc", rpcError.message);
    return fail(photoRpcErrorKey(rpcError.message));
  }

  if (player.photo_path && player.photo_path !== path) {
    await removeStorageObject(actor.supabase, player.photo_path);
  }

  revalidatePlayerPhotos();
  return ok();
}

export async function removePlayerHeadshot(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requirePhotoWriter(formData);
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const { data: player, error: loadError } = await actor.supabase
    .from("players")
    .select("photo_path")
    .eq("id", actor.playerId)
    .maybeSingle();
  if (loadError) {
    console.error("removePlayerHeadshot load", loadError.message);
    return fail("generic");
  }
  if (!player) {
    return fail("missingPlayer");
  }

  const { error: rpcError } = await actor.supabase.rpc("set_player_headshot", {
    p_player_id: actor.playerId,
    p_photo_path: null,
  });
  if (rpcError) {
    console.error("removePlayerHeadshot rpc", rpcError.message);
    return fail(photoRpcErrorKey(rpcError.message));
  }

  await removeStorageObject(actor.supabase, player.photo_path);
  revalidatePlayerPhotos();
  return ok();
}

export async function uploadPlayerIdPdf(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requirePhotoWriter(formData);
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const uploaded = await readUploadBytes(formData, "id_pdf");
  if (!uploaded.ok) {
    return fail(uploaded.errorKey === "invalidPhotoType" ? "invalidPdfType" : uploaded.errorKey);
  }
  if (!uploaded.bytes) {
    return fail("invalidPdfType");
  }

  const inspected = inspectIdPdfBuffer(uploaded.bytes);
  if (!inspected.ok) {
    return fail(inspected.errorKey);
  }

  const { data: player, error: loadError } = await actor.supabase
    .from("players")
    .select("id_pdf_path")
    .eq("id", actor.playerId)
    .maybeSingle();
  if (loadError) {
    console.error("uploadPlayerIdPdf load", loadError.message);
    return fail("generic");
  }
  if (!player) {
    return fail("missingPlayer");
  }

  const path = nextIdPdfPath(actor.playerId);
  const pathError = assertPathBelongsToPlayer(path, actor.playerId);
  if (pathError) {
    return fail(pathError);
  }

  const { error: uploadError } = await actor.supabase.storage
    .from(PLAYER_PHOTOS_BUCKET)
    .upload(path, uploaded.bytes, {
      contentType: inspected.mime,
      upsert: false,
    });
  if (uploadError) {
    console.error("uploadPlayerIdPdf storage", uploadError.message);
    return fail("generic");
  }

  const { error: rpcError } = await actor.supabase.rpc("set_player_id_pdf", {
    p_player_id: actor.playerId,
    p_id_pdf_path: path,
  });
  if (rpcError) {
    await removeStorageObject(actor.supabase, path);
    console.error("uploadPlayerIdPdf rpc", rpcError.message);
    return fail(photoRpcErrorKey(rpcError.message));
  }

  if (player.id_pdf_path && player.id_pdf_path !== path) {
    await removeStorageObject(actor.supabase, player.id_pdf_path);
  }

  revalidatePlayerPhotos();
  return ok();
}

export async function removePlayerIdPdf(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requirePhotoWriter(formData);
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const { data: player, error: loadError } = await actor.supabase
    .from("players")
    .select("id_pdf_path")
    .eq("id", actor.playerId)
    .maybeSingle();
  if (loadError) {
    console.error("removePlayerIdPdf load", loadError.message);
    return fail("generic");
  }
  if (!player) {
    return fail("missingPlayer");
  }

  const { error: rpcError } = await actor.supabase.rpc("set_player_id_pdf", {
    p_player_id: actor.playerId,
    p_id_pdf_path: null,
  });
  if (rpcError) {
    console.error("removePlayerIdPdf rpc", rpcError.message);
    return fail(photoRpcErrorKey(rpcError.message));
  }

  await removeStorageObject(actor.supabase, player.id_pdf_path);
  revalidatePlayerPhotos();
  return ok();
}
