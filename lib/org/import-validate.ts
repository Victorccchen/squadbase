/**
 * Stage 6A preview validation against live org catalogs.
 * Never writes. Duplicate players: same English given+family + birth_date.
 */

import { parseUuid } from "./parse.ts";
import {
  ageBandFromBirthDate,
  birthAgeLabelFromBirthDate,
  type AgeBand,
} from "../age-band.ts";
import {
  competitionMembershipDecision,
  isAgeSquad,
  isAgeSquadAllowedForPlayer,
  isCompetitionTeam,
} from "./squad-team.ts";
import { jerseyNumberTakenOnTeam } from "./parse.ts";
import type { OrgErrorKey } from "./errors.ts";
import type { ImportKind } from "./import-templates.ts";
import {
  parseCoachImportValues,
  parseMatchImportValues,
  parsePlayerImportValues,
  playerDuplicateKey,
  type CoachImportDraft,
  type MatchImportDraft,
  type PlayerImportDraft,
} from "./import-parse.ts";
import type { CsvRecord } from "./import-csv.ts";

export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_BYTES = 1_000_000;

export type ImportTeam = {
  id: string;
  name: string;
  kind: string;
  age_band: AgeBand | string;
  layer_key: string | null;
  eligible_birth_ages: string[] | null;
  status: string;
};

export type ImportCatalog = {
  teams: ImportTeam[];
  players: {
    id: string;
    name_en_given: string;
    name_en_family: string;
    birth_date: string;
  }[];
  jerseyHolders: {
    player_id: string;
    team_id: string;
    jersey_number: number;
  }[];
  profiles: { id: string; phone: string | null }[];
  coaches: { id: string; profile_id: string }[];
};

export type ImportDraft = PlayerImportDraft | CoachImportDraft | MatchImportDraft;

export type ImportPreviewRow = {
  line: number;
  valid: boolean;
  errorKeys: OrgErrorKey[];
  summary: string;
  draft: ImportDraft | null;
};

export type ImportPreview = {
  kind: ImportKind;
  rows: ImportPreviewRow[];
  validCount: number;
  invalidCount: number;
};

export type ImportPreviewResult =
  | ({ ok: true } & ImportPreview)
  | { ok: false; errorKey: OrgErrorKey };

function uniqueKeys(keys: OrgErrorKey[]): OrgErrorKey[] {
  return [...new Set(keys)];
}

function lookupTeamsByRef(
  catalog: ImportCatalog,
  ref: string,
): ImportTeam[] {
  const id = parseUuid(ref);
  if (id) {
    return catalog.teams.filter((team) => team.id === id);
  }
  const needle = ref.trim().toLowerCase();
  return catalog.teams.filter((team) => team.name.trim().toLowerCase() === needle);
}

function resolveTeam(
  catalog: ImportCatalog,
  ref: string,
  expectedKind: "age_squad" | "competition_team" | null,
): { ok: true; team: ImportTeam } | { ok: false; errorKey: OrgErrorKey } {
  const matches = lookupTeamsByRef(catalog, ref);
  if (matches.length === 0) {
    return { ok: false, errorKey: expectedKind === "age_squad" ? "missingAgeSquad" : "teamNotFound" };
  }
  if (matches.length > 1) {
    return { ok: false, errorKey: "ambiguousTeamName" };
  }
  const team = matches[0]!;
  if (expectedKind === "age_squad" && !isAgeSquad(team)) {
    return { ok: false, errorKey: "invalidTeamKind" };
  }
  if (expectedKind === "competition_team" && !isCompetitionTeam(team)) {
    return { ok: false, errorKey: "invalidTeamKind" };
  }
  return { ok: true, team };
}

function resolveProfile(
  catalog: ImportCatalog,
  draft: CoachImportDraft,
): { ok: true; profileId: string } | { ok: false; errorKey: OrgErrorKey } {
  if (draft.profileId) {
    const byId = catalog.profiles.find((row) => row.id === draft.profileId);
    if (!byId) {
      return { ok: false, errorKey: "missingProfile" };
    }
    if (draft.phoneE164 && byId.phone && byId.phone !== draft.phoneE164) {
      return { ok: false, errorKey: "unknownProfilePhone" };
    }
    return { ok: true, profileId: byId.id };
  }
  if (!draft.phoneE164) {
    return { ok: false, errorKey: "unknownProfilePhone" };
  }
  const byPhone = catalog.profiles.filter((row) => row.phone === draft.phoneE164);
  if (byPhone.length === 0) {
    return { ok: false, errorKey: "unknownProfilePhone" };
  }
  if (byPhone.length > 1) {
    return { ok: false, errorKey: "ambiguousTeamName" };
  }
  return { ok: true, profileId: byPhone[0]!.id };
}

function playerSummary(draft: PlayerImportDraft): string {
  const cjk = draft.nameZh ?? draft.nameJa ?? "";
  const teams = [draft.ageSquadRef, ...draft.competition.map((row) => row.ref)].join(", ");
  return `${draft.nameEnGiven} ${draft.nameEnFamily}${cjk ? ` / ${cjk}` : ""} · ${draft.birthDate} · ${teams}`;
}

function coachSummary(draft: CoachImportDraft): string {
  return draft.profileId ?? draft.phoneE164 ?? "";
}

function matchSummary(draft: MatchImportDraft): string {
  const opponent = draft.opponent ?? "TBD";
  return `${draft.teamRef} · ${draft.kind} · ${draft.title} · ${draft.startsAt} · ${opponent} · published=${draft.isPublished}`;
}

export function previewPlayerRecords(
  records: CsvRecord[],
  catalog: ImportCatalog,
  todayIso: string,
): ImportPreviewRow[] {
  const fileDupes = new Map<string, number>();
  const fileJerseys = new Map<string, number>();
  const rows: ImportPreviewRow[] = [];

  for (const record of records) {
    const parsed = parsePlayerImportValues(record.values, todayIso);
    if (!parsed.ok) {
      rows.push({
        line: record.line,
        valid: false,
        errorKeys: parsed.errorKeys,
        summary: "",
        draft: null,
      });
      continue;
    }
    const draft = parsed.draft;
    const errorKeys: OrgErrorKey[] = [];
    const dupKey = playerDuplicateKey(draft);
    const existing = catalog.players.find(
      (player) =>
        playerDuplicateKey({
          nameEnGiven: player.name_en_given,
          nameEnFamily: player.name_en_family,
          birthDate: player.birth_date,
        }) === dupKey,
    );
    if (existing) {
      errorKeys.push("duplicatePlayer");
    }
    const priorLine = fileDupes.get(dupKey);
    if (priorLine) {
      errorKeys.push("duplicateInFile");
    } else {
      fileDupes.set(dupKey, record.line);
    }

    const squad = resolveTeam(catalog, draft.ageSquadRef, "age_squad");
    if (!squad.ok) {
      errorKeys.push(squad.errorKey);
    } else {
      const natural = ageBandFromBirthDate(draft.birthDate);
      if (!isAgeSquadAllowedForPlayer(natural, squad.team.age_band as AgeBand)) {
        errorKeys.push("membershipBandNotAllowed");
      }
      const jerseyKey = `${squad.team.id}:${draft.ageSquadJersey}`;
      if (fileJerseys.has(jerseyKey)) {
        errorKeys.push("jerseyTaken");
      } else {
        fileJerseys.set(jerseyKey, record.line);
      }
      if (
        jerseyNumberTakenOnTeam({
          playerId: "",
          teamId: squad.team.id,
          jersey: draft.ageSquadJersey,
          holders: catalog.jerseyHolders,
        })
      ) {
        errorKeys.push("jerseyTaken");
      }
    }

    const competitionTeams: ImportTeam[] = [];
    for (const slot of draft.competition) {
      const team = resolveTeam(catalog, slot.ref, "competition_team");
      if (!team.ok) {
        errorKeys.push(team.errorKey);
        continue;
      }
      competitionTeams.push(team.team);
      const jerseyKey = `${team.team.id}:${slot.jersey}`;
      if (fileJerseys.has(jerseyKey)) {
        errorKeys.push("jerseyTaken");
      } else {
        fileJerseys.set(jerseyKey, record.line);
      }
      if (
        jerseyNumberTakenOnTeam({
          playerId: "",
          teamId: team.team.id,
          jersey: slot.jersey,
          holders: catalog.jerseyHolders,
        })
      ) {
        errorKeys.push("jerseyTaken");
      }
    }

    const birthAge = birthAgeLabelFromBirthDate(draft.birthDate);
    for (const team of competitionTeams) {
      const decision = competitionMembershipDecision({
        birthAge,
        continuesTraining: draft.continuesTraining,
        team: {
          id: team.id,
          kind: team.kind,
          layer_key: team.layer_key,
          eligible_birth_ages: team.eligible_birth_ages,
        },
        otherActiveTeams: competitionTeams.filter((row) => row.id !== team.id),
      });
      if (!decision.ok) {
        errorKeys.push(decision.errorKey);
      }
    }

    const keys = uniqueKeys(errorKeys);
    rows.push({
      line: record.line,
      valid: keys.length === 0,
      errorKeys: keys,
      summary: playerSummary(draft),
      draft: keys.length === 0 ? draft : null,
    });
  }
  return rows;
}

export function previewCoachRecords(
  records: CsvRecord[],
  catalog: ImportCatalog,
): ImportPreviewRow[] {
  const seenProfiles = new Set<string>();
  return records.map((record) => {
    const parsed = parseCoachImportValues(record.values);
    if (!parsed.ok) {
      return {
        line: record.line,
        valid: false,
        errorKeys: parsed.errorKeys,
        summary: "",
        draft: null,
      };
    }
    const errorKeys: OrgErrorKey[] = [];
    const profile = resolveProfile(catalog, parsed.draft);
    if (!profile.ok) {
      errorKeys.push(profile.errorKey);
    } else {
      if (catalog.coaches.some((coach) => coach.profile_id === profile.profileId)) {
        errorKeys.push("coachAlreadyLinked");
      }
      if (seenProfiles.has(profile.profileId)) {
        errorKeys.push("duplicateInFile");
      }
      seenProfiles.add(profile.profileId);
    }
    for (const ref of parsed.draft.teamRefs) {
      const team = resolveTeam(catalog, ref, null);
      if (!team.ok) {
        errorKeys.push(team.errorKey);
      }
    }
    const keys = uniqueKeys(errorKeys);
    return {
      line: record.line,
      valid: keys.length === 0,
      errorKeys: keys,
      summary: coachSummary(parsed.draft),
      draft: keys.length === 0 ? parsed.draft : null,
    };
  });
}

export function previewMatchRecords(
  records: CsvRecord[],
  catalog: ImportCatalog,
): ImportPreviewRow[] {
  return records.map((record) => {
    const parsed = parseMatchImportValues(record.values);
    if (!parsed.ok) {
      return {
        line: record.line,
        valid: false,
        errorKeys: parsed.errorKeys,
        summary: "",
        draft: null,
      };
    }
    const errorKeys: OrgErrorKey[] = [];
    const team = resolveTeam(catalog, parsed.draft.teamRef, "competition_team");
    if (!team.ok) {
      errorKeys.push(team.errorKey);
    }
    const keys = uniqueKeys(errorKeys);
    return {
      line: record.line,
      valid: keys.length === 0,
      errorKeys: keys,
      summary: matchSummary(parsed.draft),
      draft: keys.length === 0 ? parsed.draft : null,
    };
  });
}

export function buildImportPreview(
  kind: ImportKind,
  records: CsvRecord[],
  catalog: ImportCatalog,
  todayIso: string,
): ImportPreviewResult {
  if (records.length === 0) {
    return { ok: false, errorKey: "importEmpty" };
  }
  if (records.length > MAX_IMPORT_ROWS) {
    return { ok: false, errorKey: "importTooLarge" };
  }
  let rows: ImportPreviewRow[];
  if (kind === "players") {
    rows = previewPlayerRecords(records, catalog, todayIso);
  } else if (kind === "coaches") {
    rows = previewCoachRecords(records, catalog);
  } else {
    rows = previewMatchRecords(records, catalog);
  }
  return {
    ok: true,
    kind,
    rows,
    validCount: rows.filter((row) => row.valid).length,
    invalidCount: rows.filter((row) => !row.valid).length,
  };
}

export function requiredHeadersFor(kind: ImportKind): string[] {
  if (kind === "players") {
    return ["name_en_given", "name_en_family", "birth_date"];
  }
  if (kind === "coaches") {
    return [];
  }
  return ["title", "kind", "starts_at"];
}

export function headersAreValid(kind: ImportKind, headers: string[]): boolean {
  const have = new Set(headers);
  if (kind === "coaches") {
    return have.has("profile_id") || have.has("profile_phone_e164") || have.has("phone");
  }
  if (kind === "matches") {
    return (
      requiredHeadersFor(kind).every((key) => have.has(key)) &&
      (have.has("team_id") || have.has("team_name") || have.has("team"))
    );
  }
  return (
    requiredHeadersFor(kind).every((key) => have.has(key)) &&
    (have.has("age_squad_id") ||
      have.has("age_squad_name") ||
      have.has("age_squad") ||
      have.has("squad_name")) &&
    (have.has("age_squad_jersey") || have.has("jersey") || have.has("squad_jersey"))
  );
}

export function resolvedPlayerIds(draft: PlayerImportDraft, catalog: ImportCatalog) {
  const squad = resolveTeam(catalog, draft.ageSquadRef, "age_squad");
  const competition = draft.competition.map((slot) => ({
    team: resolveTeam(catalog, slot.ref, "competition_team"),
    jersey: slot.jersey,
  }));
  return { squad, competition };
}

export function resolvedCoachProfile(draft: CoachImportDraft, catalog: ImportCatalog) {
  return resolveProfile(catalog, draft);
}

export function resolvedMatchTeam(draft: MatchImportDraft, catalog: ImportCatalog) {
  return resolveTeam(catalog, draft.teamRef, "competition_team");
}
