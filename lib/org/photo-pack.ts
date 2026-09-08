/**
 * Stage P.1 admin league-registration ZIP (pure).
 *
 * roster.xlsx + manifest.csv + photos/ (+ pdfs/ when packed).
 * Missing storage objects skip the file and still list the player.
 */

import { canAccessAdmin } from "../auth/roles.ts";
import type { AppRole } from "../supabase/database.types.ts";
import { englishPlayerName, localizedPlayerName, type PlayerNameFields } from "./display-name.ts";
import type { OrgErrorKey } from "./errors.ts";
import { stringifyCsv } from "./import-csv.ts";
import { workbookToXlsx } from "./import-xlsx-write.ts";
import { parseUuid, readAllStrings, readString } from "./parse.ts";
import {
  extensionForHeadshotMime,
  playerHasHeadshot,
  playerHasIdPdf,
  sniffHeadshotMime,
} from "./player-photos.ts";
import { formatExportStamp } from "./reports.ts";
import { zipStore, type ZipStoreEntry } from "./zip-store.ts";

export const PHOTO_PACK_PLAYER_CAP = 200;
export const PHOTO_PACK_ZIP_MIME = "application/zip";
export const PHOTO_PACK_ROSTER_XLSX = "roster.xlsx";
export const PHOTO_PACK_MANIFEST_CSV = "manifest.csv";
export const PHOTO_PACK_PHOTOS_DIR = "photos";
export const PHOTO_PACK_PDFS_DIR = "pdfs";

export type PhotoPackCopy = {
  jersey: string;
  player: string;
  nameEn: string;
  birthDate: string;
  unit: string;
  hasPhoto: string;
  hasPdf: string;
  photoFile: string;
  pdfFile: string;
  yes: string;
  no: string;
};

export type PhotoPackSourceRow = {
  playerId: string;
  player: PlayerNameFields;
  birthDate: string;
  jersey: number | null;
  unitLabel: string;
  photoPath: string | null;
  idPdfPath: string | null;
};

export type PhotoPackScope = {
  locale: string;
  teamId: string | null;
  ageSquadIds: string[];
  competitionTeamIds: string[];
};

export type PackedPhotoFiles = {
  photoZipPath: string | null;
  pdfZipPath: string | null;
};

export function canExportPhotoPack(roles: readonly AppRole[]): boolean {
  return canAccessAdmin([...roles]);
}

export function photoPackCapError(playerCount: number): "photoPackTooMany" | null {
  return playerCount > PHOTO_PACK_PLAYER_CAP ? "photoPackTooMany" : null;
}

export function sanitizePhotoPackNamePart(value: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return cleaned.slice(0, 40) || "player";
}

export function photoPackIdShort(playerId: string): string {
  return playerId.replace(/-/g, "").slice(0, 8).toLowerCase();
}

export function photoPackFileStem(input: {
  jersey: number | null;
  displayName: string;
  playerId: string;
}): string {
  const jersey = input.jersey != null ? String(input.jersey) : "x";
  const name = sanitizePhotoPackNamePart(input.displayName);
  return `${jersey}_${name}_${photoPackIdShort(input.playerId)}`;
}

export function extensionFromStoragePath(path: string): string {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (ext === "jpeg") {
    return "jpg";
  }
  if (ext === "jpg" || ext === "png" || ext === "webp" || ext === "pdf") {
    return ext;
  }
  return "bin";
}

export function uniqueZipPath(desired: string, used: Set<string>): string {
  if (!used.has(desired)) {
    used.add(desired);
    return desired;
  }
  const dot = desired.lastIndexOf(".");
  const stem = dot >= 0 ? desired.slice(0, dot) : desired;
  const ext = dot >= 0 ? desired.slice(dot) : "";
  let n = 2;
  let next = `${stem}_${n}${ext}`;
  while (used.has(next)) {
    n += 1;
    next = `${stem}_${n}${ext}`;
  }
  used.add(next);
  return next;
}

export function playersInPhotoPackScope<
  T extends {
    memberships: { status: string; team_id: string }[];
  },
>(players: T[], teamIds: readonly string[]): T[] {
  const units = new Set(teamIds);
  return players.filter((player) => {
    const active = player.memberships.filter((row) => row.status === "active");
    if (active.length === 0) {
      return false;
    }
    if (units.size === 0) {
      return true;
    }
    return active.some((row) => units.has(row.team_id));
  });
}

export function filterActiveMembersForCompetitionTeam<
  T extends {
    membership: { status: string; team_id: string };
    team: { id: string; kind: string };
    player: { id: string };
  },
>(rows: T[], teamId: string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (row.team.id !== teamId || row.membership.team_id !== teamId) {
      continue;
    }
    if (row.team.kind !== "competition_team") {
      continue;
    }
    if (row.membership.status !== "active") {
      continue;
    }
    if (seen.has(row.player.id)) {
      continue;
    }
    seen.add(row.player.id);
    out.push(row);
  }
  return out;
}

export function unitLabelForScope(
  memberships: { status: string; team_id: string; team?: { name?: string | null } | null }[],
  teamIds: readonly string[],
): string {
  const units = new Set(teamIds);
  const active = memberships.filter((row) => row.status === "active" && row.team?.name);
  const matched =
    units.size === 0 ? active : active.filter((row) => units.has(row.team_id));
  const names = [...new Set(matched.map((row) => row.team?.name?.trim()).filter(Boolean))];
  return names.join(" · ");
}

export function jerseyForScope(
  memberships: { status: string; team_id: string; jersey_number: number }[],
  teamIds: readonly string[],
): number | null {
  const units = new Set(teamIds);
  const active = memberships.filter((row) => row.status === "active");
  const matched = units.size === 0 ? active : active.filter((row) => units.has(row.team_id));
  return matched[0]?.jersey_number ?? active[0]?.jersey_number ?? null;
}

export function parsePhotoPackFormData(formData: FormData):
  | { ok: true; scope: PhotoPackScope }
  | { ok: false; errorKey: OrgErrorKey } {
  const teamRaw = readString(formData, "teamId");
  const teamId = teamRaw ? parseUuid(teamRaw) : null;
  if (teamRaw && !teamId) {
    return { ok: false, errorKey: "missingTeam" };
  }
  const ageSquadIds = readAllStrings(formData, "ageSquad")
    .map((value) => parseUuid(value))
    .filter((id): id is string => id !== null);
  const competitionTeamIds = readAllStrings(formData, "competitionTeam")
    .map((value) => parseUuid(value))
    .filter((id): id is string => id !== null);
  return {
    ok: true,
    scope: {
      locale: readString(formData, "locale") || "zh-Hant",
      teamId,
      ageSquadIds,
      competitionTeamIds,
    },
  };
}

export function allocatePackedFiles(
  rows: readonly PhotoPackSourceRow[],
  locale: string,
  downloaded: ReadonlyMap<string, Uint8Array>,
): Map<string, PackedPhotoFiles> {
  const used = new Set<string>();
  const out = new Map<string, PackedPhotoFiles>();
  for (const row of rows) {
    const stem = photoPackFileStem({
      jersey: row.jersey,
      displayName: localizedPlayerName(row.player, locale) || englishPlayerName(row.player),
      playerId: row.playerId,
    });
    let photoZipPath: string | null = null;
    let pdfZipPath: string | null = null;
    const photoBytes = row.photoPath ? downloaded.get(row.photoPath) : undefined;
    if (photoBytes && photoBytes.length > 0) {
      const sniffed = sniffHeadshotMime(photoBytes);
      const ext = sniffed
        ? extensionForHeadshotMime(sniffed)
        : extensionFromStoragePath(row.photoPath ?? "");
      photoZipPath = uniqueZipPath(`${PHOTO_PACK_PHOTOS_DIR}/${stem}.${ext}`, used);
    }
    const pdfBytes = row.idPdfPath ? downloaded.get(row.idPdfPath) : undefined;
    if (pdfBytes && pdfBytes.length > 0) {
      pdfZipPath = uniqueZipPath(`${PHOTO_PACK_PDFS_DIR}/${stem}.pdf`, used);
    }
    out.set(row.playerId, { photoZipPath, pdfZipPath });
  }
  return out;
}

export function photoPackTable(
  rows: readonly PhotoPackSourceRow[],
  packed: ReadonlyMap<string, PackedPhotoFiles>,
  copy: PhotoPackCopy,
  locale: string,
): string[][] {
  const header = [
    copy.jersey,
    copy.player,
    copy.nameEn,
    copy.birthDate,
    copy.unit,
    copy.hasPhoto,
    copy.hasPdf,
    copy.photoFile,
    copy.pdfFile,
  ];
  const body = rows.map((row) => {
    const files = packed.get(row.playerId);
    return [
      row.jersey == null ? "" : String(row.jersey),
      localizedPlayerName(row.player, locale) || englishPlayerName(row.player),
      englishPlayerName(row.player),
      row.birthDate,
      row.unitLabel,
      files?.photoZipPath ? copy.yes : copy.no,
      files?.pdfZipPath ? copy.yes : copy.no,
      files?.photoZipPath ?? "",
      files?.pdfZipPath ?? "",
    ];
  });
  return [header, ...body];
}

export function buildPhotoPackZipEntries(input: {
  rows: readonly PhotoPackSourceRow[];
  downloaded: ReadonlyMap<string, Uint8Array>;
  copy: PhotoPackCopy;
  locale: string;
}): { entries: ZipStoreEntry[]; table: string[][] } {
  const packed = allocatePackedFiles(input.rows, input.locale, input.downloaded);
  const table = photoPackTable(input.rows, packed, input.copy, input.locale);
  const entries: ZipStoreEntry[] = [
    { name: PHOTO_PACK_ROSTER_XLSX, data: workbookToXlsx(table) },
    { name: PHOTO_PACK_MANIFEST_CSV, data: new TextEncoder().encode(stringifyCsv(table)) },
  ];
  for (const row of input.rows) {
    const files = packed.get(row.playerId);
    if (files?.photoZipPath && row.photoPath) {
      const bytes = input.downloaded.get(row.photoPath);
      if (bytes) {
        entries.push({ name: files.photoZipPath, data: bytes });
      }
    }
    if (files?.pdfZipPath && row.idPdfPath) {
      const bytes = input.downloaded.get(row.idPdfPath);
      if (bytes) {
        entries.push({ name: files.pdfZipPath, data: bytes });
      }
    }
  }
  return { entries, table };
}

export function encodePhotoPackZip(entries: readonly ZipStoreEntry[]): Uint8Array {
  return zipStore(entries);
}

export function photoPackFilename(options: {
  teamName?: string | null;
  exportedAt: Date;
}): string {
  const stamp = formatExportStamp(options.exportedAt);
  const team = options.teamName?.trim()
    ? sanitizePhotoPackNamePart(options.teamName)
    : "roster";
  return `player_photos_${team}_${stamp}.zip`;
}

export function storagePathsToDownload(rows: readonly PhotoPackSourceRow[]): string[] {
  const paths = new Set<string>();
  for (const row of rows) {
    if (playerHasHeadshot({ photo_path: row.photoPath }) && row.photoPath) {
      paths.add(row.photoPath);
    }
    if (playerHasIdPdf({ id_pdf_path: row.idPdfPath }) && row.idPdfPath) {
      paths.add(row.idPdfPath);
    }
  }
  return [...paths];
}
