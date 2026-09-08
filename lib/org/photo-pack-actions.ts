"use server";

import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { getTeam, listPlayers, listTeamPlayers } from "@/lib/org/queries";
import { downloadPlayerStorageObjects } from "@/lib/org/photo-pack-queries";
import { photoPackCopyForLocale } from "@/lib/org/report-copy";
import { createClient } from "@/lib/supabase/server";
import type { OrgErrorKey } from "@/lib/org/errors";
import { bytesToBase64 } from "@/lib/org/reports";
import {
  buildPhotoPackZipEntries,
  canExportPhotoPack,
  encodePhotoPackZip,
  filterActiveMembersForCompetitionTeam,
  jerseyForScope,
  parsePhotoPackFormData,
  photoPackCapError,
  photoPackFilename,
  PHOTO_PACK_ZIP_MIME,
  playersInPhotoPackScope,
  storagePathsToDownload,
  unitLabelForScope,
  type PhotoPackSourceRow,
} from "@/lib/org/photo-pack";

export type PhotoPackExportState = {
  ok: boolean;
  errorKey: OrgErrorKey | null;
  attempted: boolean;
  filename: string | null;
  mime: string | null;
  base64: string | null;
  playerCount: number;
};

export const INITIAL_PHOTO_PACK_EXPORT_STATE: PhotoPackExportState = {
  ok: false,
  errorKey: null,
  attempted: false,
  filename: null,
  mime: null,
  base64: null,
  playerCount: 0,
};

export async function exportAdminPhotoPack(formData: FormData): Promise<PhotoPackExportState> {
  const failed = (errorKey: OrgErrorKey): PhotoPackExportState => ({
    ...INITIAL_PHOTO_PACK_EXPORT_STATE,
    attempted: true,
    errorKey,
  });

  if (!getPublicSupabaseEnv().isConfigured) {
    return failed("notConfigured");
  }
  const { user, roles } = await loadSignedInAccount();
  if (!user || !canExportPhotoPack(roles)) {
    return failed("forbidden");
  }

  const parsed = parsePhotoPackFormData(formData);
  if (!parsed.ok) {
    return failed(parsed.errorKey);
  }
  const { scope } = parsed;
  const copy = photoPackCopyForLocale(scope.locale);
  const exportedAt = new Date();

  let rows: PhotoPackSourceRow[] = [];
  let teamName: string | null = null;

  if (scope.teamId) {
    const team = await getTeam(scope.teamId);
    if (!team) {
      return failed("missingTeam");
    }
    if (team.kind !== "competition_team") {
      return failed("invalidTeamKind");
    }
    teamName = team.name;
    const roster = await listTeamPlayers(team.id);
    rows = filterActiveMembersForCompetitionTeam(roster, team.id).map((row) => ({
      playerId: row.player.id,
      player: row.player,
      birthDate: row.player.birth_date,
      jersey: row.membership.jersey_number,
      unitLabel: row.team.name,
      photoPath: row.player.photo_path,
      idPdfPath: row.player.id_pdf_path,
    }));
  } else {
    const teamIds = [...scope.ageSquadIds, ...scope.competitionTeamIds];
    const players = playersInPhotoPackScope(await listPlayers(), teamIds);
    rows = players.map((player) => ({
      playerId: player.id,
      player,
      birthDate: player.birth_date,
      jersey: jerseyForScope(player.memberships, teamIds),
      unitLabel: unitLabelForScope(player.memberships, teamIds),
      photoPath: player.photo_path,
      idPdfPath: player.id_pdf_path,
    }));
  }

  const cap = photoPackCapError(rows.length);
  if (cap) {
    return failed(cap);
  }

  const supabase = await createClient();
  const downloaded = await downloadPlayerStorageObjects(supabase, storagePathsToDownload(rows));
  const { entries } = buildPhotoPackZipEntries({
    rows,
    downloaded,
    copy,
    locale: scope.locale,
  });
  const bytes = encodePhotoPackZip(entries);
  const filename = photoPackFilename({ teamName, exportedAt });

  return {
    ok: true,
    errorKey: null,
    attempted: true,
    filename,
    mime: PHOTO_PACK_ZIP_MIME,
    base64: bytesToBase64(bytes),
    playerCount: rows.length,
  };
}
