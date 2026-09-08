import type { OrgErrorKey } from "./errors.ts";

export const PLAYER_PHOTOS_BUCKET = "player-photos";
export const MAX_HEADSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_ID_PDF_BYTES = 8 * 1024 * 1024;
export const HEADSHOT_MAX_EDGE_PX = 2000;
export const SIGNED_PHOTO_TTL_SECONDS = 60 * 60;

export const HEADSHOT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ID_PDF_MIME_TYPE = "application/pdf";

export type HeadshotMime = (typeof HEADSHOT_MIME_TYPES)[number];
export type PhotoKind = "headshot" | "id_pdf";

export type PhotoAuthzInput = {
  isAdmin: boolean;
  isApprovedGuardian: boolean;
  isAssignedCoach: boolean;
};

const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] as const; // %PDF
const EXE_MAGIC = [0x4d, 0x5a] as const; // MZ

export function canWritePlayerPhoto(input: PhotoAuthzInput): boolean {
  return input.isAdmin || input.isApprovedGuardian;
}

export function canReadPlayerPhoto(input: PhotoAuthzInput): boolean {
  return input.isAdmin || input.isApprovedGuardian || input.isAssignedCoach;
}

export function writeDeniedErrorKey(input: PhotoAuthzInput): OrgErrorKey {
  if (input.isApprovedGuardian || input.isAdmin) {
    return "forbidden";
  }
  if (!input.isAdmin && !input.isAssignedCoach) {
    return "notApprovedGuardian";
  }
  return "forbidden";
}

export function playerHasHeadshot(player: { photo_path?: string | null }): boolean {
  return Boolean(player.photo_path?.trim());
}

export function playerHasIdPdf(player: { id_pdf_path?: string | null }): boolean {
  return Boolean(player.id_pdf_path?.trim());
}

export function isMissingHeadshotFilter(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1" || raw === "true";
}

export function filterPlayersMissingHeadshot<T extends { photo_path?: string | null }>(
  players: T[],
): T[] {
  return players.filter((player) => !playerHasHeadshot(player));
}

export function headshotListMarker(player: {
  photo_path?: string | null;
  id_pdf_path?: string | null;
}): "thumb" | "missing" {
  return playerHasHeadshot(player) ? "thumb" : "missing";
}

export function attachmentFlag(player: {
  photo_path?: string | null;
  id_pdf_path?: string | null;
}): "image" | "pdf-only" | "image+pdf" | "none" {
  const image = playerHasHeadshot(player);
  const pdf = playerHasIdPdf(player);
  if (image && pdf) {
    return "image+pdf";
  }
  if (image) {
    return "image";
  }
  if (pdf) {
    return "pdf-only";
  }
  return "none";
}

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((value, index) => bytes[index] === value);
}

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false;
  }
  const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const webp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return riff && webp;
}

export function sniffHeadshotMime(bytes: Uint8Array): HeadshotMime | null {
  if (startsWith(bytes, JPEG_MAGIC)) {
    return "image/jpeg";
  }
  if (startsWith(bytes, PNG_MAGIC)) {
    return "image/png";
  }
  if (isWebp(bytes)) {
    return "image/webp";
  }
  return null;
}

export function sniffPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, PDF_MAGIC);
}

export function isRejectedExecutable(bytes: Uint8Array): boolean {
  return startsWith(bytes, EXE_MAGIC);
}

export function extensionForHeadshotMime(mime: HeadshotMime): "jpg" | "png" | "webp" {
  if (mime === "image/png") {
    return "png";
  }
  if (mime === "image/webp") {
    return "webp";
  }
  return "jpg";
}

export function normalizeDeclaredImageMime(value: string | null | undefined): HeadshotMime | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "image/jpg" || raw === "image/jpeg") {
    return "image/jpeg";
  }
  if (raw === "image/png" || raw === "image/webp") {
    return raw;
  }
  return null;
}

export function inspectHeadshotBuffer(bytes: Uint8Array):
  | { ok: true; mime: HeadshotMime }
  | { ok: false; errorKey: OrgErrorKey } {
  if (bytes.length === 0) {
    return { ok: false, errorKey: "invalidPhotoType" };
  }
  if (bytes.length > MAX_HEADSHOT_BYTES) {
    return { ok: false, errorKey: "photoTooLarge" };
  }
  if (isRejectedExecutable(bytes)) {
    return { ok: false, errorKey: "invalidPhotoType" };
  }
  const mime = sniffHeadshotMime(bytes);
  if (!mime) {
    return { ok: false, errorKey: "invalidPhotoType" };
  }
  return { ok: true, mime };
}

export function inspectIdPdfBuffer(bytes: Uint8Array):
  | { ok: true; mime: typeof ID_PDF_MIME_TYPE }
  | { ok: false; errorKey: OrgErrorKey } {
  if (bytes.length === 0) {
    return { ok: false, errorKey: "invalidPdfType" };
  }
  if (bytes.length > MAX_ID_PDF_BYTES) {
    return { ok: false, errorKey: "pdfTooLarge" };
  }
  if (isRejectedExecutable(bytes) || !sniffPdf(bytes)) {
    return { ok: false, errorKey: "invalidPdfType" };
  }
  return { ok: true, mime: ID_PDF_MIME_TYPE };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function playerIdFromStoragePath(path: string): string | null {
  const folder = path.split("/")[0] ?? "";
  return UUID_RE.test(folder) ? folder.toLowerCase() : null;
}

export function assertPathBelongsToPlayer(
  path: string,
  playerId: string,
): OrgErrorKey | null {
  const folder = playerIdFromStoragePath(path);
  if (!folder || folder !== playerId.toLowerCase()) {
    return "invalidPhotoPath";
  }
  return null;
}

export function nextHeadshotPath(
  playerId: string,
  mime: HeadshotMime,
  now = Date.now(),
  nonce = crypto.randomUUID(),
): string {
  const ext = extensionForHeadshotMime(mime);
  return `${playerId}/headshot-${now}-${nonce}.${ext}`;
}

export function nextIdPdfPath(
  playerId: string,
  now = Date.now(),
  nonce = crypto.randomUUID(),
): string {
  return `${playerId}/id-document-${now}-${nonce}.pdf`;
}

export function replaceUpdatesPath(previousPath: string | null, nextPath: string): boolean {
  return Boolean(nextPath) && nextPath !== previousPath;
}

const PUBLIC_PHOTO_LEAK_RE =
  /player-photos|\/storage\/v1\/object\/public\/|\/storage\/v1\/object\/sign\/|photo_path|id_pdf_path|photo_updated_at/i;

export function htmlLeaksPlayerPhoto(html: string): boolean {
  return PUBLIC_PHOTO_LEAK_RE.test(html);
}

export const PUBLIC_PLAYER_PHOTO_KEYS = [
  "photo_path",
  "photo_updated_at",
  "id_pdf_path",
] as const;

/** Error keys the photo forms may surface after submit (never hide the upload UI). */
export const PHOTO_ALERT_KEYS = [
  "forbidden",
  "notConfigured",
  "generic",
  "missingPlayer",
  "invalidPhotoType",
  "photoTooLarge",
  "invalidPdfType",
  "pdfTooLarge",
  "invalidPhotoPath",
  "notApprovedGuardian",
] as const satisfies readonly OrgErrorKey[];

export function photoSectionDomId(playerId: string): string {
  return `player-photo-${playerId}`;
}

export function parsePhotoAlertKey(value: string | string[] | null | undefined): OrgErrorKey | null {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim();
  if (!raw) {
    return null;
  }
  return (PHOTO_ALERT_KEYS as readonly string[]).includes(raw) ? (raw as OrgErrorKey) : "generic";
}

export function firstSearchParam(value: string | string[] | null | undefined): string | null {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim();
  return raw ? raw : null;
}

export function photoAlertFromSearchParams(params: {
  photoAlert?: string | string[];
  photoPlayer?: string | string[];
}): { errorKey: OrgErrorKey; playerId: string | null } | null {
  const errorKey = parsePhotoAlertKey(params.photoAlert);
  if (!errorKey) {
    return null;
  }
  return { errorKey, playerId: firstSearchParam(params.photoPlayer) };
}

export function isSafePhotoReturnPath(path: string): boolean {
  return /^\/(zh-Hant|en|ja)\/app(\/[\w.-]+)*$/.test(path);
}

export function photoActionRedirectPath(input: {
  returnTo: string;
  playerId: string;
  errorKey: string | null;
}): string | null {
  if (!input.playerId || !isSafePhotoReturnPath(input.returnTo)) {
    return null;
  }
  const hash = `#${photoSectionDomId(input.playerId)}`;
  if (!input.errorKey) {
    return `${input.returnTo}${hash}`;
  }
  const key = parsePhotoAlertKey(input.errorKey) ?? "generic";
  const query = new URLSearchParams({
    photoAlert: key,
    photoPlayer: input.playerId,
  });
  return `${input.returnTo}?${query.toString()}${hash}`;
}
