import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessmentRpcErrorKey,
  mapStage5SnapshotToScores,
  parseAssessmentEventFormData,
  parseAssessmentNote,
  parseAssessmentScore,
  parseStoredAssessmentItem,
  parseStoredSituations,
  parseStoredTraits,
} from "./parse.ts";
import { STAGE5_SITUATION_TO_PHASE, STAGE5_TRAIT_TO_CODE } from "./model.ts";

describe("parseAssessmentScore", () => {
  it("accepts integers 1–5", () => {
    assert.equal(parseAssessmentScore("1"), 1);
    assert.equal(parseAssessmentScore("5"), 5);
    assert.equal(parseAssessmentScore(" 3 "), 3);
  });

  it("rejects scores outside 1–5 (T5C-2)", () => {
    assert.equal(parseAssessmentScore("0"), null);
    assert.equal(parseAssessmentScore("6"), null);
    assert.equal(parseAssessmentScore("3.5"), null);
    assert.equal(parseAssessmentScore(""), null);
    assert.equal(parseAssessmentScore("01"), null);
    assert.equal(parseAssessmentScore("-1"), null);
  });
});

describe("parseAssessmentNote", () => {
  it("treats blank as null and rejects over 1000 chars", () => {
    assert.equal(parseAssessmentNote(""), null);
    assert.equal(parseAssessmentNote("  "), null);
    assert.equal(parseAssessmentNote("press"), "press");
    assert.equal(parseAssessmentNote("x".repeat(1000)), "x".repeat(1000));
    assert.equal(parseAssessmentNote("x".repeat(1001)), "too_long");
  });
});

describe("parseAssessmentEventFormData", () => {
  const playerId = "11111111-1111-1111-1111-111111111111";
  const today = "2026-09-21";

  function filledForm(overrides: Record<string, string> = {}): FormData {
    const form = new FormData();
    form.set("player_id", playerId);
    form.set("assessed_on", today);
    form.set("trait_A_score", "3");
    form.set("trait_B_score", "4");
    form.set("trait_C_score", "2");
    form.set("trait_D_score", "5");
    form.set("phase_attack_score", "1");
    form.set("phase_defence_score", "2");
    form.set("phase_trans_attack_score", "3");
    form.set("phase_trans_defence_score", "4");
    form.set("note", "first touch");
    for (const [key, value] of Object.entries(overrides)) {
      form.set(key, value);
    }
    return form;
  }

  it("parses a complete 1–5 event (T5C-1)", () => {
    const parsed = parseAssessmentEventFormData(filledForm(), today);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.payload.playerId, playerId);
    assert.equal(parsed.payload.assessedOn, today);
    assert.equal(parsed.payload.note, "first touch");
    assert.equal(parsed.payload.scores.length, 8);
    assert.equal(
      parsed.payload.scores.find(
        (score) => score.dimension_kind === "trait" && score.dimension_code === "A",
      )?.score,
      3,
    );
    assert.equal(
      parsed.payload.scores.find(
        (score) =>
          score.dimension_kind === "phase" && score.dimension_code === "defence",
      )?.score,
      2,
    );
  });

  it("accepts a partial event with one score (T5C-1)", () => {
    const form = new FormData();
    form.set("player_id", playerId);
    form.set("assessed_on", today);
    form.set("trait_A_score", "4");
    const parsed = parseAssessmentEventFormData(form, today);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.deepEqual(parsed.payload.scores, [
      { dimension_kind: "trait", dimension_code: "A", score: 4 },
    ]);
  });

  it("rejects a score outside 1–5 (T5C-2)", () => {
    const parsed = parseAssessmentEventFormData(
      filledForm({ phase_defence_score: "6" }),
      today,
    );
    assert.deepEqual(parsed, { ok: false, errorKey: "invalidScore" });
  });

  it("rejects an event with no scores (T5C-1)", () => {
    const form = new FormData();
    form.set("player_id", playerId);
    form.set("assessed_on", today);
    const parsed = parseAssessmentEventFormData(form, today);
    assert.deepEqual(parsed, { ok: false, errorKey: "missingScore" });
  });

  it("rejects a future assessed_on date", () => {
    const parsed = parseAssessmentEventFormData(
      filledForm({ assessed_on: "2026-09-22" }),
      today,
    );
    assert.deepEqual(parsed, { ok: false, errorKey: "futureAssessedOn" });
  });
});

describe("Stage 5 JSONB mapping (T5C-7)", () => {
  it("maps situations to phase codes and traits to ABCD", () => {
    assert.equal(STAGE5_SITUATION_TO_PHASE.attack, "attack");
    assert.equal(STAGE5_SITUATION_TO_PHASE.defense, "defence");
    assert.equal(STAGE5_SITUATION_TO_PHASE.attack_to_defense, "trans_defence");
    assert.equal(STAGE5_SITUATION_TO_PHASE.defense_to_attack, "trans_attack");
    assert.equal(STAGE5_TRAIT_TO_CODE.adaptability, "A");
    assert.equal(STAGE5_TRAIT_TO_CODE.resilience, "B");
    assert.equal(STAGE5_TRAIT_TO_CODE.coachability, "C");
    assert.equal(STAGE5_TRAIT_TO_CODE.team_commitment, "D");

    const scores = mapStage5SnapshotToScores(
      {
        attack: { score: 3, note: null },
        defense: { score: 4, note: null },
        attack_to_defense: { score: 2, note: null },
        defense_to_attack: { score: 5, note: null },
      },
      {
        adaptability: { score: 1, note: null },
        resilience: { score: 2, note: null },
        coachability: { score: 3, note: null },
        team_commitment: { score: 4, note: null },
      },
    );
    assert.equal(scores.length, 8);
    assert.deepEqual(
      scores.find((s) => s.dimension_kind === "phase" && s.dimension_code === "defence"),
      { dimension_kind: "phase", dimension_code: "defence", score: 4 },
    );
    assert.deepEqual(
      scores.find((s) => s.dimension_kind === "trait" && s.dimension_code === "D"),
      { dimension_kind: "trait", dimension_code: "D", score: 4 },
    );
  });
});

describe("parseStored assessment JSON", () => {
  it("accepts valid items and situations", () => {
    assert.deepEqual(parseStoredAssessmentItem({ score: 2, note: null }), {
      score: 2,
      note: null,
    });
    const situations = parseStoredSituations({
      attack: { score: 1 },
      defense: { score: 2, note: "mark" },
      attack_to_defense: { score: 3 },
      defense_to_attack: { score: 4 },
    });
    assert.equal(situations?.defense.note, "mark");
    assert.equal(parseStoredTraits({ adaptability: { score: 1 } }), null);
  });
});

describe("assessmentRpcErrorKey", () => {
  it("maps authorization and validation messages (T5C-5)", () => {
    assert.equal(
      assessmentRpcErrorKey({ message: "not authorized" }),
      "forbidden",
    );
    assert.equal(
      assessmentRpcErrorKey({ message: "invalid score" }),
      "invalidScore",
    );
    assert.equal(
      assessmentRpcErrorKey({ message: "assessment event requires at least one score" }),
      "missingScore",
    );
    assert.equal(
      assessmentRpcErrorKey({ message: "assessment not found" }),
      "assessmentNotFound",
    );
  });
});
