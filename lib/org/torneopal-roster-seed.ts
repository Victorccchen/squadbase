/**
 * Stage R1: parse Torneopal FUTURO roster CSV (zh name + jersey) into
 * idempotent create/update/skip/error actions. No database I/O.
 *
 * English names stay the literal placeholder "Pending". Birthdates are
 * documented age-band placeholders so the player lands in the matching 梯隊.
 */

import {
  formatIsoDate,
  getSeasonStart,
  ageBandFromBirthDate,
  birthAgeLabelFromBirthDate,
  SEASON_START_DAY,
  SEASON_START_MONTH,
  todayInClubTimeZone,
  type AgeBand,
  type BirthAgeLabel,
  type CalendarDate,
} from "../age-band.ts";
import type { OrgErrorKey } from "./errors.ts";
import { cell } from "./import-parse.ts";
import { parseCsv, recordsFromTable, stringifyCsv, type CsvRecord } from "./import-csv.ts";
import { parseJersey, jerseyNumberTakenOnTeam } from "./parse.ts";
import {
  AGE_SQUAD_SEED_NAMES,
  TORNEOPAL_FUTURO_COMPETITION_TEAMS,
  birthAgeLabelsForSquadBand,
  competitionMembershipDecision,
  isAgeSquad,
  isCompetitionTeam,
} from "./squad-team.ts";
import { PLAYER_TEMPLATE_HEADERS } from "./import-validate.ts";

export const TORNEOPAL_EN_PLACEHOLDER = "Pending";
export const TORNEOPAL_SEED_NOTE =
  "Torneopal seed; birthdate placeholder; replace with real DOB";

export const TORNEOPAL_ROSTER_HEADERS = [
  "torneopal_team",
  "competition_team",
  "age_squad",
  "jersey_number",
  "zh_family_name",
  "zh_given_name",
  "zh_full_name",
  "source",
] as const;

export type TorneopalRosterHeader = (typeof TORNEOPAL_ROSTER_HEADERS)[number];

const COMPETITION_ALIAS_TO_CANONICAL: Record<string, string> = {
  futurou8: "Futuro U8",
  u8: "Futuro U8",
  futurou9: "Futuro U9",
  u9: "Futuro U9",
  futurou10: "Futuro U10",
  futurou10白: "Futuro U10",
  futurou10藍: "Futuro U10",
  u10白: "Futuro U10",
  u10藍: "Futuro U10",
  u10: "Futuro U10",
  futurou11: "Futuro U11",
  u11: "Futuro U11",
  futurou12黃: "Futuro U12 黃",
  u12黃: "Futuro U12 黃",
  futurou12藍: "Futuro U12 藍",
  u12藍: "Futuro U12 藍",
};

const SQUAD_ALIAS_TO_CANONICAL: Record<string, string> = {
  u6: "梯隊 U6",
  梯隊u6: "梯隊 U6",
  u8: "梯隊 U8",
  梯隊u8: "梯隊 U8",
  u10: "梯隊 U10",
  梯隊u10: "梯隊 U10",
  u12: "梯隊 U12",
  梯隊u12: "梯隊 U12",
  u15: "梯隊 U15",
  梯隊u15: "梯隊 U15",
  u18: "梯隊 U18",
  梯隊u18: "梯隊 U18",
  預備隊: "預備隊",
  成人隊: "成人隊",
};

export type TorneopalSeedTeam = {
  id: string;
  name: string;
  kind: string;
  age_band: AgeBand | string;
  layer_key: string | null;
  eligible_birth_ages: string[] | null;
  status: string;
};

export type TorneopalSeedPlayer = {
  id: string;
  name_zh: string | null;
  name_en_given: string;
  name_en_family: string;
  birth_date: string;
  status: string;
  continues_training: boolean;
};

export type TorneopalSeedMembership = {
  id?: string;
  player_id: string;
  team_id: string;
  jersey_number: number;
  status: string;
};

export type TorneopalSeedCatalog = {
  teams: TorneopalSeedTeam[];
  players: TorneopalSeedPlayer[];
  memberships: TorneopalSeedMembership[];
};

export type PlannedCompetitionSlot = {
  teamId: string;
  teamName: string;
  jersey: number;
};

export type PlannedPlayer = {
  zhName: string;
  nameEnGiven: string;
  nameEnFamily: string;
  birthDate: string;
  birthLabel: BirthAgeLabel;
  ageSquadId: string;
  ageSquadName: string;
  ageSquadJersey: number;
  competition: PlannedCompetitionSlot[];
  sourceLines: number[];
  sources: string[];
  seedNote: string;
};

export type RosterSeedCreateAction = {
  kind: "create";
  player: PlannedPlayer;
};

export type RosterSeedUpdateAction = {
  kind: "update";
  playerId: string;
  player: PlannedPlayer;
  changes: string[];
};

export type RosterSeedSkipAction = {
  kind: "skip";
  playerId: string;
  player: PlannedPlayer;
  reason: string;
};

export type RosterSeedErrorAction = {
  kind: "error";
  zhName: string;
  lines: number[];
  errorKey: OrgErrorKey;
  detail: string;
};

export type RosterSeedAction =
  | RosterSeedCreateAction
  | RosterSeedUpdateAction
  | RosterSeedSkipAction
  | RosterSeedErrorAction;

export type RosterSeedPlan = {
  ok: boolean;
  headerError: OrgErrorKey | null;
  actions: RosterSeedAction[];
  created: number;
  updated: number;
  skipped: number;
  errors: number;
};

type GroupedListing = {
  zhName: string;
  lines: number[];
  ageSquadNames: string[];
  competition: { teamName: string; jersey: number; line: number }[];
  sources: string[];
};

function aliasKey(raw: string): string {
  return raw
    .normalize("NFKC")
    .replaceAll(/[\u200B-\u200D\uFEFF]/g, "")
    .replaceAll("台中", "")
    .replaceAll(/white/gi, "白")
    .replaceAll(/blue|蓝/gi, "藍")
    .replaceAll(/yellow|黄/gi, "黃")
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, "");
}

export function normalizeZhName(value: string): string {
  return value
    .normalize("NFC")
    .replaceAll(/[\u200B-\u200D\uFEFF]/g, "")
    .replaceAll(/[\s\u3000]+/g, "")
    .trim();
}

export function canonicalCompetitionTeamName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const exact = TORNEOPAL_FUTURO_COMPETITION_TEAMS.find((team) => team.name === trimmed);
  if (exact) {
    return exact.name;
  }
  return COMPETITION_ALIAS_TO_CANONICAL[aliasKey(trimmed)] ?? null;
}

export function canonicalAgeSquadName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const seedNames = Object.values(AGE_SQUAD_SEED_NAMES);
  if (seedNames.includes(trimmed as (typeof seedNames)[number])) {
    return trimmed;
  }
  return SQUAD_ALIAS_TO_CANONICAL[aliasKey(trimmed)] ?? null;
}

export function completedAgeForBirthLabel(label: BirthAgeLabel): number {
  switch (label) {
    case "U6":
      return 5;
    case "U7":
      return 7;
    case "U8":
      return 8;
    case "U9":
      return 9;
    case "U10":
      return 10;
    case "U11":
      return 11;
    case "U12":
      return 12;
    case "U13":
      return 13;
    case "U14":
      return 14;
    case "U15":
      return 15;
    case "U16":
      return 16;
    case "U17":
      return 17;
    case "U18":
      return 17;
    case "senior":
      return 18;
    default: {
      const _never: never = label;
      throw new Error(`Unhandled birth-age label: ${_never}`);
    }
  }
}

export function placeholderBirthDateForLabel(
  label: BirthAgeLabel,
  asOf?: CalendarDate,
): string {
  const season = getSeasonStart(asOf ?? todayInClubTimeZone());
  const age = completedAgeForBirthLabel(label);
  return formatIsoDate({
    year: season.year - age,
    month: SEASON_START_MONTH,
    day: SEASON_START_DAY,
  });
}

export function isPlaceholderEnglishName(given: string, family: string): boolean {
  return given.trim() === TORNEOPAL_EN_PLACEHOLDER && family.trim() === TORNEOPAL_EN_PLACEHOLDER;
}

export function isPlaceholderBirthDate(value: string, asOf?: CalendarDate): boolean {
  const labels: BirthAgeLabel[] = [
    "U6",
    "U7",
    "U8",
    "U9",
    "U10",
    "U11",
    "U12",
    "U13",
    "U14",
    "U15",
    "U16",
    "U17",
    "U18",
    "senior",
  ];
  return labels.some((label) => placeholderBirthDateForLabel(label, asOf) === value);
}

export function torneopalRosterHeadersAreValid(headers: readonly string[]): boolean {
  const set = new Set(headers);
  return TORNEOPAL_ROSTER_HEADERS.every((header) => set.has(header));
}

function zhNameFromRecord(values: Record<string, string>): string {
  const full = normalizeZhName(cell(values, "zh_full_name"));
  if (full) {
    return full;
  }
  return normalizeZhName(`${cell(values, "zh_family_name")}${cell(values, "zh_given_name")}`);
}

function findTeam(
  catalog: TorneopalSeedCatalog,
  name: string,
  kind: "age_squad" | "competition_team",
): TorneopalSeedTeam | undefined {
  const matches = catalog.teams.filter(
    (team) => team.name === name && team.kind === kind && team.status === "active",
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function pickBirthLabel(
  squadBand: AgeBand,
  competitionTeams: TorneopalSeedTeam[],
): BirthAgeLabel | null {
  const squadLabels = new Set(birthAgeLabelsForSquadBand(squadBand));
  let allowed = [...squadLabels];
  for (const team of competitionTeams) {
    const eligible = new Set(team.eligible_birth_ages ?? []);
    allowed = allowed.filter((label) => eligible.has(label));
  }
  if (allowed.length === 0) {
    return null;
  }
  allowed.sort((a, b) => completedAgeForBirthLabel(b) - completedAgeForBirthLabel(a));
  return allowed[0] ?? null;
}

function allocateSquadJersey(
  preferred: number,
  squadId: string,
  playerId: string,
  holders: { player_id: string; team_id: string; jersey_number: number }[],
): number | null {
  if (
    !jerseyNumberTakenOnTeam({
      playerId,
      teamId: squadId,
      jersey: preferred,
      holders,
    })
  ) {
    return preferred;
  }
  for (let jersey = 1; jersey <= 99; jersey += 1) {
    if (
      !jerseyNumberTakenOnTeam({
        playerId,
        teamId: squadId,
        jersey,
        holders,
      })
    ) {
      return jersey;
    }
  }
  return null;
}

function groupRecords(records: CsvRecord[]): {
  groups: GroupedListing[];
  errors: RosterSeedErrorAction[];
} {
  const groups = new Map<string, GroupedListing>();
  const errors: RosterSeedErrorAction[] = [];
  const failedNames = new Set<string>();

  for (const record of records) {
    const zhName = zhNameFromRecord(record.values);
    if (!zhName) {
      errors.push({
        kind: "error",
        zhName: "",
        lines: [record.line],
        errorKey: "missingZhName",
        detail: "Row is missing zh_full_name / zh family+given",
      });
      continue;
    }
    const jersey = parseJersey(cell(record.values, "jersey_number"));
    const competitionName = canonicalCompetitionTeamName(
      cell(record.values, "competition_team", "torneopal_team"),
    );
    const squadName = canonicalAgeSquadName(cell(record.values, "age_squad"));
    if (jersey === null) {
      errors.push({
        kind: "error",
        zhName,
        lines: [record.line],
        errorKey: "invalidJersey",
        detail: `Invalid jersey on line ${record.line}`,
      });
      continue;
    }
    if (!competitionName) {
      errors.push({
        kind: "error",
        zhName,
        lines: [record.line],
        errorKey: "teamNotFound",
        detail: `Unknown 隊伍 on line ${record.line}: ${cell(record.values, "competition_team", "torneopal_team")}`,
      });
      continue;
    }
    if (!squadName) {
      errors.push({
        kind: "error",
        zhName,
        lines: [record.line],
        errorKey: "missingAgeSquad",
        detail: `Unknown 梯隊 on line ${record.line}: ${cell(record.values, "age_squad")}`,
      });
      continue;
    }

    const existing = groups.get(zhName);
    const source = cell(record.values, "source");
    if (!existing) {
      groups.set(zhName, {
        zhName,
        lines: [record.line],
        ageSquadNames: [squadName],
        competition: [{ teamName: competitionName, jersey, line: record.line }],
        sources: source ? [source] : [],
      });
      continue;
    }
    existing.lines.push(record.line);
    existing.ageSquadNames.push(squadName);
    if (source && !existing.sources.includes(source)) {
      existing.sources.push(source);
    }
    const sameTeam = existing.competition.find((slot) => slot.teamName === competitionName);
    if (sameTeam) {
      if (sameTeam.jersey !== jersey) {
        errors.push({
          kind: "error",
          zhName,
          lines: [...existing.lines],
          errorKey: "invalidJersey",
          detail: `Conflicting jersey for ${competitionName}`,
        });
        failedNames.add(zhName);
      }
      continue;
    }
    existing.competition.push({ teamName: competitionName, jersey, line: record.line });
  }

  return {
    groups: [...groups.values()].filter((group) => !failedNames.has(group.zhName)),
    errors,
  };
}

function existingPlayersByZh(
  catalog: TorneopalSeedCatalog,
  zhName: string,
): TorneopalSeedPlayer[] {
  return catalog.players.filter((player) => normalizeZhName(player.name_zh ?? "") === zhName);
}

function membershipsFor(
  catalog: TorneopalSeedCatalog,
  playerId: string,
): TorneopalSeedMembership[] {
  return catalog.memberships.filter((row) => row.player_id === playerId && row.status === "active");
}

function desiredStateMatches(
  existing: TorneopalSeedPlayer,
  memberships: TorneopalSeedMembership[],
  planned: PlannedPlayer,
): boolean {
  if (existing.name_zh !== planned.zhName) {
    return false;
  }
  const squad = memberships.find((row) => row.team_id === planned.ageSquadId);
  if (!squad || squad.jersey_number !== planned.ageSquadJersey) {
    return false;
  }
  const competition = memberships.filter((row) =>
    planned.competition.some((slot) => slot.teamId === row.team_id),
  );
  if (competition.length !== planned.competition.length) {
    return false;
  }
  for (const slot of planned.competition) {
    const row = competition.find((item) => item.team_id === slot.teamId);
    if (!row || row.jersey_number !== slot.jersey) {
      return false;
    }
  }
  const extras = memberships.filter(
    (row) =>
      row.team_id !== planned.ageSquadId &&
      !planned.competition.some((slot) => slot.teamId === row.team_id),
  );
  return extras.length === 0;
}

function planFromGroup(
  group: GroupedListing,
  catalog: TorneopalSeedCatalog,
  holders: { player_id: string; team_id: string; jersey_number: number }[],
  asOf?: CalendarDate,
): RosterSeedAction {
  const uniqueSquads = [...new Set(group.ageSquadNames)];
  if (uniqueSquads.length !== 1) {
    return {
      kind: "error",
      zhName: group.zhName,
      lines: group.lines,
      errorKey: "conflictingAgeSquad",
      detail: `Cross-listed rows disagree on 梯隊: ${uniqueSquads.join(", ")}`,
    };
  }
  if (group.competition.length > 2) {
    return {
      kind: "error",
      zhName: group.zhName,
      lines: group.lines,
      errorKey: "tooManyActiveMemberships",
      detail: "A player may join at most two 隊伍",
    };
  }

  const squadName = uniqueSquads[0]!;
  const squad = findTeam(catalog, squadName, "age_squad");
  if (!squad || !isAgeSquad(squad)) {
    return {
      kind: "error",
      zhName: group.zhName,
      lines: group.lines,
      errorKey: "missingAgeSquad",
      detail: `梯隊 not found: ${squadName}`,
    };
  }

  const matches = existingPlayersByZh(catalog, group.zhName);
  if (matches.length > 1) {
    return {
      kind: "error",
      zhName: group.zhName,
      lines: group.lines,
      errorKey: "ambiguousZhName",
      detail: "Multiple existing players share this Chinese name",
    };
  }

  const existing = matches[0] ?? null;
  const existingId = existing?.id ?? "";
  const existingMemberships = existing ? membershipsFor(catalog, existing.id) : [];
  const existingSquad = existingMemberships.find((row) => {
    const team = catalog.teams.find((item) => item.id === row.team_id);
    return team && isAgeSquad(team);
  });

  const competitionTeams: TorneopalSeedTeam[] = [];
  const plannedCompetition: PlannedCompetitionSlot[] = [];
  for (const slot of group.competition) {
    const team = findTeam(catalog, slot.teamName, "competition_team");
    if (!team || !isCompetitionTeam(team)) {
      return {
        kind: "error",
        zhName: group.zhName,
        lines: group.lines,
        errorKey: "teamNotFound",
        detail: `隊伍 not found: ${slot.teamName}`,
      };
    }
    if (
      jerseyNumberTakenOnTeam({
        playerId: existingId,
        teamId: team.id,
        jersey: slot.jersey,
        holders,
      })
    ) {
      return {
        kind: "error",
        zhName: group.zhName,
        lines: group.lines,
        errorKey: "jerseyTaken",
        detail: `${slot.teamName} #${slot.jersey} is taken`,
      };
    }
    competitionTeams.push(team);
    plannedCompetition.push({
      teamId: team.id,
      teamName: team.name,
      jersey: slot.jersey,
    });
  }

  const birthLabel = pickBirthLabel(squad.age_band as AgeBand, competitionTeams);
  if (!birthLabel) {
    return {
      kind: "error",
      zhName: group.zhName,
      lines: group.lines,
      errorKey: "membershipBirthNotEligible",
      detail: `No birth-age placeholder fits ${squadName} and ${plannedCompetition.map((row) => row.teamName).join(", ")}`,
    };
  }

  const decisionTeams = competitionTeams.map((team) => ({
    id: team.id,
    kind: team.kind,
    layer_key: team.layer_key,
    eligible_birth_ages: team.eligible_birth_ages,
  }));
  for (const team of decisionTeams) {
    const decision = competitionMembershipDecision({
      birthAge: birthLabel,
      continuesTraining: true,
      team,
      otherActiveTeams: decisionTeams.filter((row) => row.id !== team.id),
      isExistingMembership: existingMemberships.some((row) => row.team_id === team.id),
    });
    if (!decision.ok) {
      return {
        kind: "error",
        zhName: group.zhName,
        lines: group.lines,
        errorKey: decision.errorKey,
        detail: `${team.id} rejected (${decision.errorKey})`,
      };
    }
  }

  const preferredJersey = plannedCompetition[0]?.jersey ?? 1;
  const keepSquadJersey =
    existingSquad && existingSquad.team_id === squad.id ? existingSquad.jersey_number : preferredJersey;
  const squadJersey = allocateSquadJersey(
    keepSquadJersey,
    squad.id,
    existingId,
    holders,
  );
  if (squadJersey === null) {
    return {
      kind: "error",
      zhName: group.zhName,
      lines: group.lines,
      errorKey: "jerseyTaken",
      detail: `No free 梯隊 jersey on ${squadName}`,
    };
  }

  let birthDate = placeholderBirthDateForLabel(birthLabel, asOf);
  let nameEnGiven = TORNEOPAL_EN_PLACEHOLDER;
  let nameEnFamily = TORNEOPAL_EN_PLACEHOLDER;
  if (existing) {
    if (!isPlaceholderEnglishName(existing.name_en_given, existing.name_en_family)) {
      nameEnGiven = existing.name_en_given;
      nameEnFamily = existing.name_en_family;
    }
    if (!isPlaceholderBirthDate(existing.birth_date, asOf)) {
      birthDate = existing.birth_date;
      const natural = ageBandFromBirthDate(birthDate, asOf);
      if (natural !== squad.age_band) {
        return {
          kind: "error",
          zhName: group.zhName,
          lines: group.lines,
          errorKey: "membershipBandNotAllowed",
          detail: "Existing real DOB does not land in the CSV 梯隊; not overwritten",
        };
      }
      const realLabel = birthAgeLabelFromBirthDate(birthDate, asOf);
      for (const team of competitionTeams) {
        if (!(team.eligible_birth_ages ?? []).includes(realLabel ?? "")) {
          return {
            kind: "error",
            zhName: group.zhName,
            lines: group.lines,
            errorKey: "membershipBirthNotEligible",
            detail: "Existing real DOB is not eligible for a CSV 隊伍; not overwritten",
          };
        }
      }
    }
  }

  const planned: PlannedPlayer = {
    zhName: group.zhName,
    nameEnGiven,
    nameEnFamily,
    birthDate,
    birthLabel,
    ageSquadId: squad.id,
    ageSquadName: squad.name,
    ageSquadJersey: squadJersey,
    competition: plannedCompetition,
    sourceLines: group.lines,
    sources: group.sources,
    seedNote: TORNEOPAL_SEED_NOTE,
  };

  holders.push({
    player_id: existingId || `pending:${group.zhName}`,
    team_id: squad.id,
    jersey_number: squadJersey,
  });
  for (const slot of plannedCompetition) {
    holders.push({
      player_id: existingId || `pending:${group.zhName}`,
      team_id: slot.teamId,
      jersey_number: slot.jersey,
    });
  }

  if (!existing) {
    return { kind: "create", player: planned };
  }

  if (desiredStateMatches(existing, existingMemberships, planned)) {
    return {
      kind: "skip",
      playerId: existing.id,
      player: planned,
      reason: "Already on the matching 梯隊 / 隊伍 with the same jerseys",
    };
  }

  const changes: string[] = [];
  if (existingSquad?.team_id !== planned.ageSquadId || existingSquad?.jersey_number !== planned.ageSquadJersey) {
    changes.push("age_squad");
  }
  const existingCompetition = existingMemberships.filter((row) => {
    const team = catalog.teams.find((item) => item.id === row.team_id);
    return team && isCompetitionTeam(team);
  });
  const existingKey = existingCompetition
    .map((row) => `${row.team_id}:${row.jersey_number}`)
    .sort()
    .join(",");
  const plannedKey = planned.competition
    .map((row) => `${row.teamId}:${row.jersey}`)
    .sort()
    .join(",");
  if (existingKey !== plannedKey) {
    changes.push("competition_membership");
  }
  if (changes.length === 0) {
    changes.push("membership");
  }
  return {
    kind: "update",
    playerId: existing.id,
    player: planned,
    changes,
  };
}

export function planTorneopalRosterSeed(
  table: string[][],
  catalog: TorneopalSeedCatalog,
  asOf?: CalendarDate,
): RosterSeedPlan {
  const { headers, records } = recordsFromTable(table);
  if (!torneopalRosterHeadersAreValid(headers)) {
    return {
      ok: false,
      headerError: "importHeaderInvalid",
      actions: [],
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
    };
  }

  const grouped = groupRecords(records);
  const actions: RosterSeedAction[] = [...grouped.errors];
  const holders = catalog.memberships.map((row) => ({
    player_id: row.player_id,
    team_id: row.team_id,
    jersey_number: row.jersey_number,
  }));
  for (const group of grouped.groups) {
    actions.push(planFromGroup(group, catalog, holders, asOf));
  }

  const created = actions.filter((row) => row.kind === "create").length;
  const updated = actions.filter((row) => row.kind === "update").length;
  const skipped = actions.filter((row) => row.kind === "skip").length;
  const errors = actions.filter((row) => row.kind === "error").length;
  return {
    ok: errors === 0,
    headerError: null,
    actions,
    created,
    updated,
    skipped,
    errors,
  };
}

export function parseTorneopalRosterCsv(
  text: string,
  catalog: TorneopalSeedCatalog,
  asOf?: CalendarDate,
): RosterSeedPlan {
  return planTorneopalRosterSeed(parseCsv(text), catalog, asOf);
}

export function emitAdminPlayerImportCsv(actions: readonly RosterSeedAction[]): string {
  const rows: string[][] = [[...PLAYER_TEMPLATE_HEADERS]];
  for (const action of actions) {
    if (action.kind === "error") {
      continue;
    }
    const player = action.player;
    const first = player.competition[0];
    const second = player.competition[1];
    rows.push([
      player.nameEnGiven,
      player.nameEnFamily,
      player.birthDate,
      player.zhName,
      "",
      "",
      player.ageSquadName,
      String(player.ageSquadJersey),
      "",
      first?.teamName ?? "",
      first ? String(first.jersey) : "",
      "",
      second?.teamName ?? "",
      second ? String(second.jersey) : "",
      "true",
    ]);
  }
  return stringifyCsv(rows);
}

export function formatRosterSeedReport(plan: RosterSeedPlan): string {
  const lines = [
    `Torneopal roster seed report`,
    `created=${plan.created} updated=${plan.updated} skipped=${plan.skipped} errors=${plan.errors}`,
    `marker: EN ${TORNEOPAL_EN_PLACEHOLDER}/${TORNEOPAL_EN_PLACEHOLDER}; ${TORNEOPAL_SEED_NOTE}`,
  ];
  if (plan.headerError) {
    lines.push(`header_error=${plan.headerError}`);
  }
  for (const action of plan.actions) {
    switch (action.kind) {
      case "create":
        lines.push(
          `CREATE ${action.player.zhName} ${action.player.ageSquadName}#${action.player.ageSquadJersey} ${action.player.competition.map((row) => `${row.teamName}#${row.jersey}`).join("+")} DOB=${action.player.birthDate} lines=${action.player.sourceLines.join(",")}`,
        );
        break;
      case "update":
        lines.push(
          `UPDATE ${action.playerId} ${action.player.zhName} changes=${action.changes.join(",")} ${action.player.competition.map((row) => `${row.teamName}#${row.jersey}`).join("+")}`,
        );
        break;
      case "skip":
        lines.push(`SKIP ${action.playerId} ${action.player.zhName} ${action.reason}`);
        break;
      case "error":
        lines.push(
          `ERROR ${action.errorKey} ${action.zhName || "(unnamed)"} lines=${action.lines.join(",")} ${action.detail}`,
        );
        break;
      default: {
        const _never: never = action;
        throw new Error(`Unhandled roster seed action: ${JSON.stringify(_never)}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
