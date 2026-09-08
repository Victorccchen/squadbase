import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FUTURO_COMPETITION_TEAMS,
  ageSquadBandFromBirthDate,
  ageSquadBandFromCompletedAge,
  birthAgeLabelFromBirthDate,
  birthAgeLabelFromCompletedAge,
  competitionMembershipDecision,
  isTeamKindAllowedForSessionKind,
  teamsForMatchCreate,
  teamsForTrainingCreate,
} from "./squad-team.ts";

const futuro = Object.fromEntries(
  FUTURO_COMPETITION_TEAMS.map((team) => [
    team.name,
    {
      id: team.name,
      kind: "competition_team" as const,
      layer_key: team.layerKey,
      eligible_birth_ages: [...team.eligibleBirthAges],
    },
  ]),
);

function decide(
  birthAge: "U6" | "U7" | "U8" | "U9" | "U10",
  teamName: keyof typeof futuro,
  otherNames: (keyof typeof futuro)[] = [],
  continuesTraining = true,
) {
  return competitionMembershipDecision({
    birthAge,
    continuesTraining,
    team: futuro[teamName]!,
    otherActiveTeams: otherNames.map((name) => futuro[name]!),
  });
}

describe("birth-age labels from completed age (season start)", () => {
  it("maps ages 6–10 to U6–U10", () => {
    assert.equal(birthAgeLabelFromCompletedAge(6), "U6");
    assert.equal(birthAgeLabelFromCompletedAge(7), "U7");
    assert.equal(birthAgeLabelFromCompletedAge(8), "U8");
    assert.equal(birthAgeLabelFromCompletedAge(9), "U9");
    assert.equal(birthAgeLabelFromCompletedAge(10), "U10");
  });

  it("clamps younger than 6 to U6 and 18+ to senior", () => {
    assert.equal(birthAgeLabelFromCompletedAge(5), "U6");
    assert.equal(birthAgeLabelFromCompletedAge(18), "senior");
  });
});

describe("梯隊 assignment (T-ST birth bands)", () => {
  it("Birth U6–U8 → 梯隊 U8; U9–U10 → 梯隊 U10", () => {
    assert.equal(ageSquadBandFromCompletedAge(6), "U8");
    assert.equal(ageSquadBandFromCompletedAge(7), "U8");
    assert.equal(ageSquadBandFromCompletedAge(8), "U8");
    assert.equal(ageSquadBandFromCompletedAge(9), "U10");
    assert.equal(ageSquadBandFromCompletedAge(10), "U10");
  });

  it("keeps ages 0–5 on 梯隊 U6", () => {
    assert.equal(ageSquadBandFromCompletedAge(5), "U6");
    assert.equal(ageSquadBandFromCompletedAge(0), "U6");
  });

  it("derives the same bands from DOB at season start 15 Aug 2026", () => {
    const asOf = "2026-08-15";
    assert.equal(birthAgeLabelFromBirthDate("2018-08-15", asOf), "U8");
    assert.equal(ageSquadBandFromBirthDate("2018-08-15", asOf), "U8");
    assert.equal(birthAgeLabelFromBirthDate("2017-08-15", asOf), "U9");
    assert.equal(ageSquadBandFromBirthDate("2017-08-15", asOf), "U10");
    assert.equal(birthAgeLabelFromBirthDate("2019-08-15", asOf), "U7");
    assert.equal(ageSquadBandFromBirthDate("2019-08-15", asOf), "U8");
  });
});

describe("T-ST-1 Birth U8", () => {
  it("Futuro U8 + U9 OK; third rejected; U10藍 rejected", () => {
    assert.equal(decide("U8", "Futuro U8").ok, true);
    assert.equal(decide("U8", "Futuro U9", ["Futuro U8"]).ok, true);
    const extraEligible = {
      id: "extra-u6",
      kind: "competition_team" as const,
      layer_key: "u6",
      eligible_birth_ages: ["U6", "U7", "U8"],
    };
    assert.equal(
      competitionMembershipDecision({
        birthAge: "U8",
        continuesTraining: true,
        team: extraEligible,
        otherActiveTeams: [futuro["Futuro U8"]!, futuro["Futuro U9"]!],
      }).errorKey,
      "tooManyActiveMemberships",
    );
    assert.equal(decide("U8", "Futuro U10藍").errorKey, "membershipBirthNotEligible");
    assert.equal(decide("U8", "Futuro U10白").errorKey, "membershipBirthNotEligible");
  });
});

describe("T-ST-2 Birth U9", () => {
  it("Futuro U9 + U10藍 OK; U10白 while on 藍 rejected; Futuro U8 rejected", () => {
    assert.equal(decide("U9", "Futuro U9").ok, true);
    assert.equal(decide("U9", "Futuro U10藍", ["Futuro U9"]).ok, true);
    assert.equal(
      decide("U9", "Futuro U10白", ["Futuro U9", "Futuro U10藍"]).errorKey,
      "membershipLayerConflict",
    );
    assert.equal(decide("U9", "Futuro U8").errorKey, "membershipBirthNotEligible");
  });
});

describe("T-ST-3 Birth U10", () => {
  it("U10白 OK; U9/U8 rejected; U10藍 while on 白 rejected", () => {
    assert.equal(decide("U10", "Futuro U10白").ok, true);
    assert.equal(decide("U10", "Futuro U9").errorKey, "membershipBirthNotEligible");
    assert.equal(decide("U10", "Futuro U8").errorKey, "membershipBirthNotEligible");
    assert.equal(
      decide("U10", "Futuro U10藍", ["Futuro U10白"]).errorKey,
      "membershipLayerConflict",
    );
  });
});

describe("T-ST-4 Birth U7", () => {
  it("Futuro U8 OK; U9/U10* rejected", () => {
    assert.equal(decide("U7", "Futuro U8").ok, true);
    assert.equal(decide("U7", "Futuro U9").errorKey, "membershipBirthNotEligible");
    assert.equal(decide("U7", "Futuro U10藍").errorKey, "membershipBirthNotEligible");
    assert.equal(decide("U7", "Futuro U10白").errorKey, "membershipBirthNotEligible");
  });
});

describe("T-ST-5 continues_training", () => {
  it("without continues_training cannot add to 隊伍", () => {
    assert.equal(
      decide("U8", "Futuro U8", [], false).errorKey,
      "continuesTrainingRequired",
    );
  });

  it("keeps an already-active 隊伍 when continues_training is later false", () => {
    const decision = competitionMembershipDecision({
      birthAge: "U8",
      continuesTraining: false,
      team: futuro["Futuro U8"]!,
      otherActiveTeams: [],
      isExistingMembership: true,
    });
    assert.equal(decision.ok, true);
  });
});

describe("T-ST-6 admin create lists", () => {
  const squad = { id: "s", name: "梯隊 U8", kind: "age_squad" as const };
  const side = { id: "c", name: "Futuro U8", kind: "competition_team" as const };

  it("training create lists 梯隊 only; match create lists 隊伍 only", () => {
    assert.deepEqual(teamsForTrainingCreate([squad, side]), [squad]);
    assert.deepEqual(teamsForMatchCreate([squad, side]), [side]);
    assert.equal(isTeamKindAllowedForSessionKind("regular", "age_squad"), true);
    assert.equal(isTeamKindAllowedForSessionKind("special", "competition_team"), false);
    assert.equal(isTeamKindAllowedForSessionKind("cup", "competition_team"), true);
    assert.equal(isTeamKindAllowedForSessionKind("league", "age_squad"), false);
    assert.equal(isTeamKindAllowedForSessionKind("friendly", "competition_team"), true);
  });
});

describe("T-ST-7 jersey uniqueness contract", () => {
  it("uniqueness is per team id, so the same number may exist on two 隊伍", () => {
    const u8 = futuro["Futuro U8"]!;
    const u9 = futuro["Futuro U9"]!;
    assert.notEqual(u8.id, u9.id);
    assert.equal(decide("U8", "Futuro U8").ok, true);
    assert.equal(decide("U8", "Futuro U9", ["Futuro U8"]).ok, true);
  });
});

describe("T-ST-8 Futuro seed layer keys", () => {
  it("locks the four Futuro 隊伍 eligibility and layer_key values", () => {
    assert.deepEqual(
      FUTURO_COMPETITION_TEAMS.map((team) => [
        team.name,
        team.layerKey,
        [...team.eligibleBirthAges],
      ]),
      [
        ["Futuro U8", "u8", ["U6", "U7", "U8"]],
        ["Futuro U9", "u9", ["U8", "U9"]],
        ["Futuro U10藍", "u10", ["U9", "U10"]],
        ["Futuro U10白", "u10", ["U9", "U10"]],
      ],
    );
  });
});
