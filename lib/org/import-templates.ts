/**
 * Stage 6A downloadable import templates (header + example row).
 */

import { stringifyCsv } from "./import-csv.ts";
import { workbookToXlsx } from "./import-xlsx-write.ts";

export const IMPORT_KINDS = ["players", "coaches", "matches"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export function isImportKind(value: string): value is ImportKind {
  return (IMPORT_KINDS as readonly string[]).includes(value);
}

export const PLAYER_TEMPLATE_HEADERS = [
  "name_en_given",
  "name_en_family",
  "birth_date",
  "name_zh",
  "name_ja",
  "age_squad_id",
  "age_squad_name",
  "age_squad_jersey",
  "competition_team_1_id",
  "competition_team_1_name",
  "competition_team_1_jersey",
  "competition_team_2_id",
  "competition_team_2_name",
  "competition_team_2_jersey",
  "continues_training",
] as const;

export const PLAYER_TEMPLATE_EXAMPLE = [
  "Kai",
  "Chen",
  "2018-08-15",
  "小凱",
  "",
  "",
  "梯隊 U8",
  "7",
  "",
  "Futuro U8",
  "10",
  "",
  "",
  "",
  "true",
] as const;

export const COACH_TEMPLATE_HEADERS = [
  "profile_id",
  "profile_phone_e164",
  "team_1_id",
  "team_1_name",
  "team_2_id",
  "team_2_name",
] as const;

export const COACH_TEMPLATE_EXAMPLE = [
  "",
  "+886912345678",
  "",
  "梯隊 U8",
  "",
  "",
] as const;

export const MATCH_TEMPLATE_HEADERS = [
  "team_id",
  "team_name",
  "title",
  "kind",
  "starts_at",
  "ends_at",
  "location",
  "opponent",
  "side",
  "is_playoff",
  "is_published",
  "notes",
] as const;

export const MATCH_TEMPLATE_EXAMPLE = [
  "",
  "Futuro U8",
  "Victory League Rd 1",
  "league",
  "2026-10-04T15:00",
  "2026-10-04T16:30",
  "Home ground",
  "",
  "home",
  "false",
  "false",
  "",
] as const;

const TEMPLATES: Record<ImportKind, { headers: readonly string[]; example: readonly string[] }> = {
  players: { headers: PLAYER_TEMPLATE_HEADERS, example: PLAYER_TEMPLATE_EXAMPLE },
  coaches: { headers: COACH_TEMPLATE_HEADERS, example: COACH_TEMPLATE_EXAMPLE },
  matches: { headers: MATCH_TEMPLATE_HEADERS, example: MATCH_TEMPLATE_EXAMPLE },
};

export function templateRows(kind: ImportKind): string[][] {
  const template = TEMPLATES[kind];
  return [[...template.headers], [...template.example]];
}

export function templateCsv(kind: ImportKind): string {
  return stringifyCsv(templateRows(kind));
}

export function templateXlsx(kind: ImportKind): Uint8Array {
  return workbookToXlsx(templateRows(kind));
}

export function templateFilename(kind: ImportKind, format: "csv" | "xlsx"): string {
  return `${kind}-import.${format}`;
}
