import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseCsv, stringifyCsv } from "./import-csv.ts";
import { PLAYER_TEMPLATE_HEADERS } from "./import-templates.ts";
import { applyTorneopalRosterPlan, type RosterSeedStore } from "./torneopal-roster-apply.ts";
import {
  TORNEOPAL_EN_PLACEHOLDER,
  TORNEOPAL_ROSTER_HEADERS,
  TORNEOPAL_SEED_NOTE,
  canonicalCompetitionTeamName,
  emitAdminPlayerImportCsv,
  parseTorneopalRosterCsv,
  placeholderBirthDateForLabel,
  type PlannedPlayer,
  type TorneopalSeedCatalog,
  type TorneopalSeedMembership,
} from "./torneopal-roster-seed.ts";
import {
  ageBandFromBirthDate,
  birthAgeLabelFromBirthDate,
} from "../age-band.ts";

const AS_OF = { year: 2026, month: 9, day: 18 };

const SQUAD_U8 = "s-u8";
const SQUAD_U10 = "s-u10";
const SQUAD_U12 = "s-u12";
const TEAM_U8 = "t-u8";
const TEAM_U9 = "t-u9";
const TEAM_U10 = "t-u10";
const TEAM_U11 = "t-u11";
const TEAM_U12_Y = "t-u12-y";
const TEAM_U12_B = "t-u12-b";

function catalog(overrides: Partial<TorneopalSeedCatalog> = {}): TorneopalSeedCatalog {
  return {
    teams: [
      {
        id: SQUAD_U8,
        name: "梯隊 U8",
        kind: "age_squad",
        age_band: "U8",
        layer_key: null,
        eligible_birth_ages: null,
        status: "active",
      },
      {
        id: SQUAD_U10,
        name: "梯隊 U10",
        kind: "age_squad",
        age_band: "U10",
        layer_key: null,
        eligible_birth_ages: null,
        status: "active",
      },
      {
        id: SQUAD_U12,
        name: "梯隊 U12",
        kind: "age_squad",
        age_band: "U12",
        layer_key: null,
        eligible_birth_ages: null,
        status: "active",
      },
      {
        id: TEAM_U8,
        name: "Futuro U8",
        kind: "competition_team",
        age_band: "U8",
        layer_key: "u8",
        eligible_birth_ages: ["U6", "U7", "U8"],
        status: "active",
      },
      {
        id: TEAM_U9,
        name: "Futuro U9",
        kind: "competition_team",
        age_band: "U8",
        layer_key: "u9",
        eligible_birth_ages: ["U8", "U9"],
        status: "active",
      },
      {
        id: TEAM_U10,
        name: "Futuro U10",
        kind: "competition_team",
        age_band: "U10",
        layer_key: "u10",
        eligible_birth_ages: ["U9", "U10"],
        status: "active",
      },
      {
        id: TEAM_U11,
        name: "Futuro U11",
        kind: "competition_team",
        age_band: "U12",
        layer_key: "u11",
        eligible_birth_ages: ["U10", "U11"],
        status: "active",
      },
      {
        id: TEAM_U12_Y,
        name: "Futuro U12 黃",
        kind: "competition_team",
        age_band: "U12",
        layer_key: "u12",
        eligible_birth_ages: ["U11", "U12"],
        status: "active",
      },
      {
        id: TEAM_U12_B,
        name: "Futuro U12 藍",
        kind: "competition_team",
        age_band: "U12",
        layer_key: "u12",
        eligible_birth_ages: ["U11", "U12"],
        status: "active",
      },
    ],
    players: [],
    memberships: [],
    ...overrides,
  };
}

function rosterCsv(rows: string[][]): string {
  return stringifyCsv([[...TORNEOPAL_ROSTER_HEADERS], ...rows]);
}

function row(overrides: {
  torneopal?: string;
  team: string;
  squad: string;
  jersey: string;
  family: string;
  given: string;
  full?: string;
  source?: string;
}): string[] {
  return [
    overrides.torneopal ?? "",
    overrides.team,
    overrides.squad,
    overrides.jersey,
    overrides.family,
    overrides.given,
    overrides.full ?? `${overrides.family}${overrides.given}`,
    overrides.source ?? "torneopal",
  ];
}

describe("Torneopal name aliases", () => {
  it("maps 台中FUTURO U10藍/白 onto Futuro U10", () => {
    assert.equal(canonicalCompetitionTeamName("台中FUTURO U10藍"), "Futuro U10");
    assert.equal(canonicalCompetitionTeamName("Futuro U10白"), "Futuro U10");
    assert.equal(canonicalCompetitionTeamName("台中FUTURO U12 黄"), "Futuro U12 黃");
    assert.equal(canonicalCompetitionTeamName("Futuro U11"), "Futuro U11");
  });
});

describe("placeholder birthdates land in the matching 梯隊", () => {
  it("U8/U10/U11/U12 placeholders match 梯隊 and birth labels", () => {
    const u8 = placeholderBirthDateForLabel("U8", AS_OF);
    const u9 = placeholderBirthDateForLabel("U9", AS_OF);
    const u10 = placeholderBirthDateForLabel("U10", AS_OF);
    const u11 = placeholderBirthDateForLabel("U11", AS_OF);
    const u12 = placeholderBirthDateForLabel("U12", AS_OF);
    assert.equal(u8, "2018-08-15");
    assert.equal(u9, "2017-08-15");
    assert.equal(ageBandFromBirthDate(u8, AS_OF), "U8");
    assert.equal(birthAgeLabelFromBirthDate(u8, AS_OF), "U8");
    assert.equal(ageBandFromBirthDate(u9, AS_OF), "U10");
    assert.equal(birthAgeLabelFromBirthDate(u9, AS_OF), "U9");
    assert.equal(ageBandFromBirthDate(u10, AS_OF), "U10");
    assert.equal(birthAgeLabelFromBirthDate(u10, AS_OF), "U10");
    assert.equal(ageBandFromBirthDate(u11, AS_OF), "U12");
    assert.equal(birthAgeLabelFromBirthDate(u11, AS_OF), "U11");
    assert.equal(ageBandFromBirthDate(u12, AS_OF), "U12");
  });
});

describe("Torneopal roster plan", () => {
  it("parses the fictional example CSV without errors", () => {
    const text = readFileSync("data/staging/torneopal-futuro-players.example.csv", "utf8");
    const plan = parseTorneopalRosterCsv(text, catalog(), AS_OF);
    assert.equal(plan.headerError, null);
    assert.equal(plan.errors, 0);
    assert.equal(plan.created, 6);
    const dual = plan.actions.find((action) => action.kind === "create" && action.player.zhName === "測跨");
    assert.ok(dual && dual.kind === "create");
    assert.equal(dual.player.competition.length, 2);
  });

  it("creates unique players with Pending English names and 隊伍 jerseys", () => {
    const csv = rosterCsv([
      row({ team: "Futuro U8", squad: "梯隊 U8", jersey: "7", family: "測", given: "甲" }),
      row({ team: "Futuro U10", squad: "梯隊 U10", jersey: "10", family: "測", given: "乙" }),
    ]);
    const plan = parseTorneopalRosterCsv(csv, catalog(), AS_OF);
    assert.equal(plan.created, 2);
    assert.equal(plan.errors, 0);
    const first = plan.actions.find((action) => action.kind === "create" && action.player.zhName === "測甲");
    assert.ok(first && first.kind === "create");
    assert.equal(first.player.nameEnGiven, TORNEOPAL_EN_PLACEHOLDER);
    assert.equal(first.player.nameEnFamily, TORNEOPAL_EN_PLACEHOLDER);
    assert.equal(first.player.seedNote, TORNEOPAL_SEED_NOTE);
    assert.equal(first.player.competition[0]?.jersey, 7);
    assert.equal(first.player.competition[0]?.teamName, "Futuro U8");
    assert.notEqual(first.player.nameEnGiven.toLowerCase(), "jia");
  });

  it("groups cross-listed Torneopal names into one player with two 隊伍", () => {
    const csv = rosterCsv([
      row({ team: "Futuro U8", squad: "梯隊 U8", jersey: "7", family: "測", given: "跨" }),
      row({
        torneopal: "台中FUTURO U9",
        team: "Futuro U9",
        squad: "梯隊 U8",
        jersey: "9",
        family: "測",
        given: "跨",
      }),
    ]);
    const plan = parseTorneopalRosterCsv(csv, catalog(), AS_OF);
    assert.equal(plan.created, 1);
    assert.equal(plan.errors, 0);
    const created = plan.actions.find((action) => action.kind === "create");
    assert.ok(created && created.kind === "create");
    assert.equal(created.player.competition.length, 2);
    assert.equal(created.player.birthLabel, "U8");
    assert.deepEqual(
      created.player.competition.map((slot) => slot.teamName).sort(),
      ["Futuro U8", "Futuro U9"],
    );
  });

  it("rejects two 隊伍 on the same layer_key (U12 黃+藍)", () => {
    const csv = rosterCsv([
      row({ team: "Futuro U12 黃", squad: "梯隊 U12", jersey: "4", family: "測", given: "同層" }),
      row({ team: "Futuro U12 藍", squad: "梯隊 U12", jersey: "5", family: "測", given: "同層" }),
    ]);
    const plan = parseTorneopalRosterCsv(csv, catalog(), AS_OF);
    assert.equal(plan.created, 0);
    assert.equal(plan.errors, 1);
    assert.equal(plan.actions[0]?.kind, "error");
    if (plan.actions[0]?.kind === "error") {
      assert.equal(plan.actions[0].errorKey, "membershipLayerConflict");
    }
  });

  it("matches an existing player by zh full name and updates jersey instead of duplicating", () => {
    const existingId = "p-1";
    const csv = rosterCsv([
      row({ team: "Futuro U8", squad: "梯隊 U8", jersey: "11", family: "測", given: "甲" }),
    ]);
    const plan = parseTorneopalRosterCsv(
      csv,
      catalog({
        players: [
          {
            id: existingId,
            name_zh: "測甲",
            name_en_given: "Kai",
            name_en_family: "Chen",
            birth_date: "2018-08-15",
            status: "active",
            continues_training: true,
          },
        ],
        memberships: [
          {
            id: "m1",
            player_id: existingId,
            team_id: SQUAD_U8,
            jersey_number: 7,
            status: "active",
          },
          {
            id: "m2",
            player_id: existingId,
            team_id: TEAM_U8,
            jersey_number: 7,
            status: "active",
          },
        ],
      }),
      AS_OF,
    );
    assert.equal(plan.created, 0);
    assert.equal(plan.updated, 1);
    const update = plan.actions.find((action) => action.kind === "update");
    assert.ok(update && update.kind === "update");
    assert.equal(update.playerId, existingId);
    assert.equal(update.player.nameEnGiven, "Kai");
    assert.equal(update.player.nameEnFamily, "Chen");
    assert.equal(update.player.competition[0]?.jersey, 11);
  });

  it("skips when memberships and jerseys already match", () => {
    const existingId = "p-skip";
    const csv = rosterCsv([
      row({ team: "Futuro U8", squad: "梯隊 U8", jersey: "7", family: "測", given: "甲" }),
    ]);
    const plan = parseTorneopalRosterCsv(
      csv,
      catalog({
        players: [
          {
            id: existingId,
            name_zh: "測甲",
            name_en_given: TORNEOPAL_EN_PLACEHOLDER,
            name_en_family: TORNEOPAL_EN_PLACEHOLDER,
            birth_date: "2018-08-15",
            status: "active",
            continues_training: true,
          },
        ],
        memberships: [
          {
            id: "m1",
            player_id: existingId,
            team_id: SQUAD_U8,
            jersey_number: 7,
            status: "active",
          },
          {
            id: "m2",
            player_id: existingId,
            team_id: TEAM_U8,
            jersey_number: 7,
            status: "active",
          },
        ],
      }),
      AS_OF,
    );
    assert.equal(plan.skipped, 1);
    assert.equal(plan.created, 0);
  });

  it("errors when two existing players share the same zh name", () => {
    const csv = rosterCsv([
      row({ team: "Futuro U8", squad: "梯隊 U8", jersey: "3", family: "測", given: "甲" }),
    ]);
    const plan = parseTorneopalRosterCsv(
      csv,
      catalog({
        players: [
          {
            id: "a",
            name_zh: "測甲",
            name_en_given: "A",
            name_en_family: "A",
            birth_date: "2018-08-15",
            status: "active",
            continues_training: true,
          },
          {
            id: "b",
            name_zh: "測甲",
            name_en_given: "B",
            name_en_family: "B",
            birth_date: "2018-08-15",
            status: "active",
            continues_training: true,
          },
        ],
      }),
      AS_OF,
    );
    assert.equal(plan.errors, 1);
    if (plan.actions[0]?.kind === "error") {
      assert.equal(plan.actions[0].errorKey, "ambiguousZhName");
    }
  });

  it("rejects a missing header row", () => {
    const csv = stringifyCsv([
      ["name", "team"],
      ["測甲", "Futuro U8"],
    ]);
    const plan = parseTorneopalRosterCsv(csv, catalog(), AS_OF);
    assert.equal(plan.headerError, "importHeaderInvalid");
    assert.equal(plan.ok, false);
  });

  it("emits a Stage 6A player CSV with Pending names and placeholder DOB", () => {
    const csv = rosterCsv([
      row({ team: "Futuro U8", squad: "梯隊 U8", jersey: "7", family: "測", given: "甲" }),
    ]);
    const plan = parseTorneopalRosterCsv(csv, catalog(), AS_OF);
    const emitted = parseCsv(emitAdminPlayerImportCsv(plan.actions));
    assert.deepEqual(emitted[0], [...PLAYER_TEMPLATE_HEADERS]);
    assert.equal(emitted[1]?.[0], TORNEOPAL_EN_PLACEHOLDER);
    assert.equal(emitted[1]?.[1], TORNEOPAL_EN_PLACEHOLDER);
    assert.equal(emitted[1]?.[2], "2018-08-15");
    assert.equal(emitted[1]?.[3], "測甲");
    assert.equal(emitted[1]?.[6], "梯隊 U8");
    assert.equal(emitted[1]?.[9], "Futuro U8");
    assert.equal(emitted[1]?.[10], "7");
  });

  it("allocates a free 梯隊 jersey when the 隊伍 number is already taken on the 梯隊", () => {
    const csv = rosterCsv([
      row({ team: "Futuro U8", squad: "梯隊 U8", jersey: "7", family: "測", given: "新" }),
    ]);
    const plan = parseTorneopalRosterCsv(
      csv,
      catalog({
        players: [
          {
            id: "other",
            name_zh: "別人",
            name_en_given: "A",
            name_en_family: "B",
            birth_date: "2018-08-15",
            status: "active",
            continues_training: true,
          },
        ],
        memberships: [
          {
            player_id: "other",
            team_id: SQUAD_U8,
            jersey_number: 7,
            status: "active",
          },
        ],
      }),
      AS_OF,
    );
    const created = plan.actions.find((action) => action.kind === "create");
    assert.ok(created && created.kind === "create");
    assert.equal(created.player.competition[0]?.jersey, 7);
    assert.notEqual(created.player.ageSquadJersey, 7);
  });
});

describe("Torneopal roster apply (in-memory)", () => {
  it("creates then skips on a second apply", async () => {
    const players = new Map<string, PlannedPlayer>();
    const memberships: TorneopalSeedMembership[] = [];
    let seq = 0;
    const store: RosterSeedStore = {
      async insertPlayer(player) {
        const id = `new-${(seq += 1)}`;
        players.set(id, player);
        return { ok: true, id };
      },
      async updatePlayerIdentity() {
        return { ok: true };
      },
      async listMemberships(playerId) {
        return memberships.filter((row) => row.player_id === playerId);
      },
      async upsertMembership(row) {
        const existing = memberships.find(
          (item) => item.player_id === row.playerId && item.team_id === row.teamId,
        );
        if (existing) {
          existing.jersey_number = row.jersey;
          existing.status = "active";
          return { ok: true };
        }
        memberships.push({
          id: `m-${(seq += 1)}`,
          player_id: row.playerId,
          team_id: row.teamId,
          jersey_number: row.jersey,
          status: "active",
        });
        return { ok: true };
      },
      async deactivateMembership(id) {
        const row = memberships.find((item) => item.id === id);
        if (row) {
          row.status = "inactive";
        }
        return { ok: true };
      },
    };

    const csv = rosterCsv([
      row({ team: "Futuro U11", squad: "梯隊 U12", jersey: "8", family: "測", given: "丙" }),
    ]);
    const firstPlan = parseTorneopalRosterCsv(csv, catalog(), AS_OF);
    const first = await applyTorneopalRosterPlan(firstPlan, store);
    assert.equal(first.created, 1);
    assert.equal(memberships.filter((row) => row.status === "active").length, 2);

    const createdId = [...players.keys()][0]!;
    const createdPlayer = players.get(createdId)!;
    const secondPlan = parseTorneopalRosterCsv(
      csv,
      catalog({
        players: [
          {
            id: createdId,
            name_zh: createdPlayer.zhName,
            name_en_given: createdPlayer.nameEnGiven,
            name_en_family: createdPlayer.nameEnFamily,
            birth_date: createdPlayer.birthDate,
            status: "active",
            continues_training: true,
          },
        ],
        memberships: memberships.map((row) => ({ ...row })),
      }),
      AS_OF,
    );
    assert.equal(secondPlan.skipped, 1);
    const second = await applyTorneopalRosterPlan(secondPlan, store);
    assert.equal(second.skipped, 1);
    assert.equal(second.created, 0);
  });
});
