import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PAPER_CARD_CELL_COUNT,
  PAPER_CARD_EXTRACTION_SCHEMA,
  confirmProblem,
  estimateCostUsd,
  isIsoDate,
  migrationProgress,
  normalizeCells,
  parseExtraction,
  parseUsedDates,
  reviewCells,
  suggestedRemaining,
} from "./paper-card.ts";

/** Synthetic AI output for a made-up card (never a real card). */
function synthetic(overrides: Record<string, unknown> = {}) {
  return {
    card_no: " A-123 ",
    package_credits: 10,
    squad_marks: ["8.10"],
    cells: [
      { index: 1, text: "9/2", date: "2026-09-02", confidence: "high" },
      { index: 2, text: "9/4", date: "2026-09-04", confidence: "high" },
      { index: 3, text: "6/1?", date: "2026-06-11", confidence: "low" },
      { index: 4, text: "", date: null, confidence: "high" },
    ],
    terms_detected: true,
    ...overrides,
  };
}

describe("paper card (PR-09)", () => {
  it("reads a synthetic extraction into 30 cells (P09-1)", () => {
    const parsed = parseExtraction(synthetic());
    assert.ok(parsed);
    assert.equal(parsed.cardNo, "A-123");
    assert.equal(parsed.packageCredits, 10);
    assert.deepEqual(parsed.squadMarks, ["8.10"]);
    assert.equal(parsed.cells.length, PAPER_CARD_CELL_COUNT);
    assert.equal(parsed.cells[2].confidence, "low");
    assert.deepEqual(parsed.cells[29], { index: 30, text: "", date: null, confidence: "high" });
  });

  it("rejects output that does not match the schema (falls back to manual)", () => {
    assert.equal(parseExtraction(null), null);
    assert.equal(parseExtraction([]), null);
    assert.equal(parseExtraction(synthetic({ package_credits: 12 })), null);
    assert.equal(parseExtraction(synthetic({ cells: "x" })), null);
    assert.equal(parseExtraction(synthetic({ cells: [{ index: 1, text: "x", date: null, confidence: "maybe" }] })), null);
    assert.equal(parseExtraction(synthetic({ squad_marks: [8.1] })), null);
  });

  it("downgrades a date the model wrote but is not a real date", () => {
    const parsed = parseExtraction(
      synthetic({ cells: [{ index: 1, text: "2/30", date: "2026-02-30", confidence: "high" }] }),
    );
    assert.ok(parsed);
    assert.equal(parsed.cells[0].date, null);
    assert.equal(parsed.cells[0].confidence, "low");
  });

  it("normalizes positions and drops out-of-range or repeated cells", () => {
    const cells = normalizeCells([
      { index: 2, text: "b", date: null, confidence: "high" },
      { index: 2, text: "dup", date: null, confidence: "high" },
      { index: 31, text: "x", date: null, confidence: "high" },
    ]);
    assert.equal(cells.length, 30);
    assert.equal(cells[1].text, "b");
    assert.equal(cells[0].text, "");
  });

  it("marks cells off the squad's session days, in the future, repeated or unreadable", () => {
    const parsed = parseExtraction(
      synthetic({
        cells: [
          { index: 1, text: "9/2", date: "2026-09-02", confidence: "high" },
          { index: 2, text: "9/3", date: "2026-09-03", confidence: "high" },
          { index: 3, text: "9/2", date: "2026-09-02", confidence: "high" },
          { index: 4, text: "12/1", date: "2026-12-01", confidence: "high" },
          { index: 5, text: "??", date: null, confidence: "low" },
          { index: 6, text: "9/4", date: "2026-09-04", confidence: "low" },
        ],
      }),
    );
    assert.ok(parsed);
    const reviewed = reviewCells(parsed.cells, {
      sessionDates: new Set(["2026-09-02", "2026-09-04"]),
      today: "2026-10-02",
    });
    assert.deepEqual(
      reviewed.slice(0, 7).map((cell) => cell.flag),
      [null, "noSession", "duplicate", "future", "unreadable", "aiUnsure", null],
    );
    assert.equal(reviewed[1].confidence, "low");
    assert.equal(reviewed[0].confidence, "high");
  });

  it("parses used dates and suggests the remaining credits", () => {
    assert.deepEqual(parseUsedDates(["2026-09-04", "2026-09-02", "", "bad", "2026-09-02"]), [
      "2026-09-02",
      "2026-09-04",
    ]);
    assert.equal(isIsoDate("2026-02-29"), false);
    assert.equal(suggestedRemaining(10, 3), 7);
    assert.equal(suggestedRemaining(10, 12), 0);
    assert.equal(suggestedRemaining(null, 3), null);
  });

  it("explains the confirm refusals before the round trip", () => {
    const base = { packageCredits: 10, remaining: 7, usedDates: ["2026-09-02"], today: "2026-10-02" };
    assert.equal(confirmProblem(base), null);
    assert.equal(confirmProblem({ ...base, packageCredits: null }), "packageRequired");
    assert.equal(confirmProblem({ ...base, remaining: 11 }), "remainingOutOfRange");
    assert.equal(confirmProblem({ ...base, remaining: null }), "remainingOutOfRange");
    assert.equal(confirmProblem({ ...base, usedDates: ["2026-10-03"] }), "futureDate");
  });

  it("estimates cost and roster progress", () => {
    assert.equal(estimateCostUsd({ inputTokens: 5000, outputTokens: 2000 }), 0.06);
    assert.equal(migrationProgress(3, 12), 0.25);
    assert.equal(migrationProgress(3, 0), null);
  });

  it("keeps the schema strict (additionalProperties false on every object)", () => {
    assert.equal(PAPER_CARD_EXTRACTION_SCHEMA.additionalProperties, false);
    assert.equal(PAPER_CARD_EXTRACTION_SCHEMA.properties.cells.items.additionalProperties, false);
  });
});
