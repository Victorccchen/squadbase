/**
 * Stage L: map Torneopal side names onto exact 隊伍 names.
 * U10 白/藍 both collapse to the merged Futuro U10 隊伍.
 */

export const TORNEOPAL_CANONICAL_TEAM_NAMES = [
  "Futuro U8",
  "Futuro U9",
  "Futuro U10",
  "Futuro U11",
  "Futuro U12 黃",
  "Futuro U12 藍",
] as const;

export type TorneopalCanonicalTeamName = (typeof TORNEOPAL_CANONICAL_TEAM_NAMES)[number];

export function aliasKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^台中\s*/u, "")
    .replace(/white/gi, "白")
    .replace(/blue|蓝/gi, "藍")
    .replace(/yellow|黄/gi, "黃")
    .replace(/\s+/g, "");
}

const ALIAS_TO_CANONICAL: Record<string, TorneopalCanonicalTeamName> = {
  futurou8: "Futuro U8",
  futurou9: "Futuro U9",
  futurou10: "Futuro U10",
  futurou10白: "Futuro U10",
  futurou10藍: "Futuro U10",
  u10白: "Futuro U10",
  u10藍: "Futuro U10",
  futurou11: "Futuro U11",
  futurou12黃: "Futuro U12 黃",
  futurou12藍: "Futuro U12 藍",
  u12黃: "Futuro U12 黃",
  u12藍: "Futuro U12 藍",
};

export function canonicalClubTeamName(raw: string): TorneopalCanonicalTeamName | null {
  const key = aliasKey(raw);
  if (!key) {
    return null;
  }
  return ALIAS_TO_CANONICAL[key] ?? null;
}

export function looksLikeClubTeamName(raw: string): boolean {
  return /futuro/i.test(raw.normalize("NFKC"));
}

export function opponentDuplicateKey(opponent: string | null | undefined): string {
  const raw = (opponent ?? "").trim();
  if (!raw) {
    return "";
  }
  return (canonicalClubTeamName(raw) ?? raw).trim().toLowerCase();
}
