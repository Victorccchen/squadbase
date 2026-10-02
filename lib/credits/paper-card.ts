/**
 * Phase 1 PR-09 paper session card helpers (pure). The AI read-out is only a
 * first draft: these checks mark the cells a person must look at, and the
 * database does the real move-in (admin_confirm_paper_card).
 */

export const PAPER_CARD_CELL_COUNT = 30;
/** D8-1: old cards keep the old price, 300 TWD per session. */
export const PAPER_CARD_UNIT_COST_TWD = 300;
export const PAPER_CARD_PACKAGES = [10, 20, 30] as const;
export type PaperCardPackage = (typeof PAPER_CARD_PACKAGES)[number];

export type CellConfidence = "high" | "low";

export type PaperCardCell = {
  /** 1-based position on the back of the card. */
  index: number;
  /** What is written, as read. Empty when the cell is blank. */
  text: string;
  /** ISO date the cell stands for, or null when blank or unreadable. */
  date: string | null;
  confidence: CellConfidence;
};

export type PaperCardExtraction = {
  cardNo: string | null;
  packageCredits: PaperCardPackage | null;
  squadMarks: string[];
  cells: PaperCardCell[];
  termsDetected: boolean;
};

/** Why a cell needs a person (null = looks fine). */
export type CellFlag = "aiUnsure" | "noSession" | "future" | "duplicate" | "unreadable";

export type ReviewedCell = PaperCardCell & { flag: CellFlag | null };

/** JSON schema for the structured AI output (snake_case on the wire). */
export const PAPER_CARD_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["card_no", "package_credits", "squad_marks", "cells", "terms_detected"],
  properties: {
    card_no: { anyOf: [{ type: "string" }, { type: "null" }], description: "Handwritten card number on the front, as written." },
    package_credits: {
      anyOf: [{ type: "integer", enum: [10, 20, 30] }, { type: "null" }],
      description: "The circled plan on the front (10, 20 or 30 sessions).",
    },
    squad_marks: {
      type: "array",
      items: { type: "string" },
      description: "Squad marks such as 8.10 (U8 and U10 squads). These are not dates.",
    },
    cells: {
      type: "array",
      description: "Every cell on the back in reading order, blank cells included.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "text", "date", "confidence"],
        properties: {
          index: { type: "integer", description: "1-based cell position." },
          text: { type: "string", description: "What is written, as read. Empty string if blank." },
          date: {
            anyOf: [{ type: "string", format: "date" }, { type: "null" }],
            description: "YYYY-MM-DD of the written date, or null if blank or unreadable.",
          },
          confidence: { type: "string", enum: ["high", "low"] },
        },
      },
    },
    terms_detected: { type: "boolean", description: "Whether the printed terms (zh/ja) are visible." },
  },
} as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isPackage(value: unknown): value is PaperCardPackage {
  return typeof value === "number" && (PAPER_CARD_PACKAGES as readonly number[]).includes(value);
}

/**
 * Reads the AI JSON. Returns null when it does not match the schema, so the
 * card falls back to manual entry (P09-6, and the "invalid" path).
 */
export function parseExtraction(raw: unknown): PaperCardExtraction | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const cardNo = value.card_no;
  const packageCredits = value.package_credits;
  const marks = value.squad_marks;
  const cells = value.cells;
  if (cardNo !== null && typeof cardNo !== "string") {
    return null;
  }
  if (packageCredits !== null && !isPackage(packageCredits)) {
    return null;
  }
  if (!Array.isArray(marks) || !marks.every((mark) => typeof mark === "string")) {
    return null;
  }
  if (!Array.isArray(cells) || cells.length > PAPER_CARD_CELL_COUNT * 2) {
    return null;
  }
  const parsedCells: PaperCardCell[] = [];
  for (const cell of cells) {
    if (!cell || typeof cell !== "object") {
      return null;
    }
    const c = cell as Record<string, unknown>;
    if (
      typeof c.index !== "number" ||
      !Number.isInteger(c.index) ||
      typeof c.text !== "string" ||
      (c.date !== null && typeof c.date !== "string") ||
      (c.confidence !== "high" && c.confidence !== "low")
    ) {
      return null;
    }
    parsedCells.push({
      index: c.index,
      text: c.text.slice(0, 40),
      date: isIsoDate(c.date) ? c.date : null,
      // A date the model wrote but we cannot read as a date is not "high".
      confidence: c.date !== null && !isIsoDate(c.date) ? "low" : c.confidence,
    });
  }
  return {
    cardNo: cardNo === null ? null : cardNo.trim().slice(0, 40) || null,
    packageCredits: packageCredits === null ? null : packageCredits,
    squadMarks: (marks as string[]).map((mark) => mark.trim()).filter(Boolean).slice(0, 4),
    cells: normalizeCells(parsedCells),
    termsDetected: value.terms_detected === true,
  };
}

/** Exactly 30 cells, by position; missing positions are blank. */
export function normalizeCells(cells: readonly PaperCardCell[]): PaperCardCell[] {
  const byIndex = new Map<number, PaperCardCell>();
  for (const cell of cells) {
    if (cell.index >= 1 && cell.index <= PAPER_CARD_CELL_COUNT && !byIndex.has(cell.index)) {
      byIndex.set(cell.index, cell);
    }
  }
  return Array.from({ length: PAPER_CARD_CELL_COUNT }, (_, i) => {
    const index = i + 1;
    return byIndex.get(index) ?? { index, text: "", date: null, confidence: "high" };
  });
}

/**
 * Second check (spec PR-09): a date must fall on a day the player's teams had
 * a session, must not be in the future, and must not repeat. Anything else,
 * or what the model itself was unsure about, is marked low for a person.
 */
export function reviewCells(
  cells: readonly PaperCardCell[],
  { sessionDates, today }: { sessionDates: ReadonlySet<string>; today: string },
): ReviewedCell[] {
  const seen = new Set<string>();
  return cells.map((cell) => {
    let flag: CellFlag | null = null;
    if (!cell.date) {
      flag = cell.text.trim() ? "unreadable" : null;
    } else if (cell.date > today) {
      flag = "future";
    } else if (seen.has(cell.date)) {
      flag = "duplicate";
    } else if (!sessionDates.has(cell.date)) {
      flag = "noSession";
    } else if (cell.confidence === "low") {
      flag = "aiUnsure";
    }
    if (cell.date) {
      seen.add(cell.date);
    }
    return { ...cell, confidence: flag ? "low" : cell.confidence, flag };
  });
}

/** Distinct, valid, sorted used dates from the review form. */
export function parseUsedDates(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(isIsoDate))].sort();
}

/** What the card should have left if every used cell is one session. */
export function suggestedRemaining(packageCredits: number | null, usedCount: number): number | null {
  if (packageCredits === null) {
    return null;
  }
  return Math.max(0, packageCredits - usedCount);
}

export type ConfirmProblem = "packageRequired" | "remainingOutOfRange" | "futureDate" | "tooManyDates";

/** Same refusals as admin_confirm_paper_card, shown before the round trip. */
export function confirmProblem(input: {
  packageCredits: number | null;
  remaining: number | null;
  usedDates: readonly string[];
  today: string;
}): ConfirmProblem | null {
  if (input.packageCredits === null || !isPackage(input.packageCredits)) {
    return "packageRequired";
  }
  if (input.remaining === null || !Number.isInteger(input.remaining) || input.remaining < 0 || input.remaining > input.packageCredits) {
    return "remainingOutOfRange";
  }
  if (input.usedDates.length > PAPER_CARD_CELL_COUNT) {
    return "tooManyDates";
  }
  if (input.usedDates.some((date) => date > input.today)) {
    return "futureDate";
  }
  return null;
}

/** Opus 5.5 list price per million tokens, for the ai_jobs cost estimate. */
const INPUT_USD_PER_MTOK = 4;
const OUTPUT_USD_PER_MTOK = 20;

export function estimateCostUsd(usage: { inputTokens: number; outputTokens: number }): number {
  const cost = (usage.inputTokens * INPUT_USD_PER_MTOK + usage.outputTokens * OUTPUT_USD_PER_MTOK) / 1_000_000;
  return Math.round(cost * 10_000) / 10_000;
}

/** Share of the active roster whose paper card is in the system (dashboard). */
export function migrationProgress(movedPlayers: number, rosterPlayers: number): number | null {
  if (rosterPlayers <= 0) {
    return null;
  }
  return Math.min(1, movedPlayers / rosterPlayers);
}
