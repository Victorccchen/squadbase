import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessmentRpcErrorKey,
  parseAssessmentFormData,
  parseAssessmentNote,
  parseAssessmentScore,
  parseStoredAssessmentItem,
  parseStoredSituations,
  parseStoredTraits,
} from "./parse.ts";

describe("parseAssessmentScore", () => {
  it("accepts integers 1–5", () => {
    assert.equal(parseAssessmentScore("1"), 1);
    assert.equal(parseAssessmentScore("5"), 5);
    assert.equal(parseAssessmentScore(" 3 "), 3);
  });

  it("rejects scores outside 1–5 (T5-2)", () => {
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

describe("parseAssessmentFormData", () => {
  const playerId = "11111111-1111-1111-1111-111111111111";
  const today = "2026-09-07";

  function filledForm(overrides: Record<string, string> = {}): FormData {
    const form = new FormData();
    form.set("player_id", playerId);
    form.set("assessed_on", today);
    form.set("sit_attack_score", "3");
    form.set("sit_defense_score", "4");
    form.set("sit_attack_to_defense_score", "2");
    form.set("sit_defense_to_attack_score", "5");
    form.set("trait_adaptability_score", "1");
    form.set("trait_resilience_score", "2");
    form.set("trait_coachability_score", "3");
    form.set("trait_team_commitment_score", "4");
    form.set("sit_attack_note", "first touch");
    for (const [key, value] of Object.entries(overrides)) {
      form.set(key, value);
    }
    return form;
  }

  it("parses a complete 1–5 assessment", () => {
    const parsed = parseAssessmentFormData(filledForm(), today);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.payload.playerId, playerId);
    assert.equal(parsed.payload.assessedOn, today);
    assert.equal(parsed.payload.situations.attack.score, 3);
    assert.equal(parsed.payload.situations.attack.note, "first touch");
    assert.equal(parsed.payload.situations.defense.note, null);
    assert.equal(parsed.payload.traits.team_commitment.score, 4);
  });

  it("rejects a score outside 1–5 (T5-2)", () => {
    const parsed = parseAssessmentFormData(
      filledForm({ sit_defense_score: "6" }),
      today,
    );
    assert.deepEqual(parsed, { ok: false, errorKey: "invalidScore" });
  });

  it("rejects a missing situation score", () => {
    const form = filledForm();
    form.delete("sit_attack_score");
    const parsed = parseAssessmentFormData(form, today);
    assert.deepEqual(parsed, { ok: false, errorKey: "invalidScore" });
  });

  it("rejects a future assessed_on date", () => {
    const parsed = parseAssessmentFormData(
      filledForm({ assessed_on: "2026-09-08" }),
      today,
    );
    assert.deepEqual(parsed, { ok: false, errorKey: "futureAssessedOn" });
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
  it("maps authorization and validation messages", () => {
    assert.equal(
      assessmentRpcErrorKey({ message: "not authorized" }),
      "forbidden",
    );
    assert.equal(
      assessmentRpcErrorKey({ message: "invalid situations" }),
      "invalidScore",
    );
    assert.equal(
      assessmentRpcErrorKey({ message: "assessment not found" }),
      "assessmentNotFound",
    );
  });
});
