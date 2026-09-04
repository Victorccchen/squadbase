import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateSessionOccurrences,
  MAX_SERIES_OCCURRENCES,
  parseSessionKind,
  parseUntilDate,
  parseWeekCount,
} from "./session-recurrence.ts";

const FIRST_START = "2026-09-10T18:00:00+08:00";
const FIRST_END = "2026-09-10T19:30:00+08:00";

describe("parseSessionKind", () => {
  it("accepts the four Stage 4A kinds", () => {
    assert.equal(parseSessionKind("regular"), "regular");
    assert.equal(parseSessionKind("special"), "special");
    assert.equal(parseSessionKind("cup"), "cup");
    assert.equal(parseSessionKind("league"), "league");
    assert.equal(parseSessionKind("playoff"), null);
    assert.equal(parseSessionKind(""), null);
  });
});

describe("parseWeekCount", () => {
  it("accepts 1–52 including the first week", () => {
    assert.equal(parseWeekCount("1"), 1);
    assert.equal(parseWeekCount("4"), 4);
    assert.equal(parseWeekCount("52"), 52);
  });

  it("rejects 0, 53, and non-integers", () => {
    assert.equal(parseWeekCount("0"), null);
    assert.equal(parseWeekCount("53"), null);
    assert.equal(parseWeekCount("4.5"), null);
    assert.equal(parseWeekCount(""), null);
  });
});

describe("parseUntilDate", () => {
  it("accepts real calendar days and rejects invalid ones", () => {
    assert.equal(parseUntilDate("2026-10-01"), "2026-10-01");
    assert.equal(parseUntilDate("2026-02-30"), null);
    assert.equal(parseUntilDate(""), null);
  });
});

describe("generateSessionOccurrences", () => {
  it("A1: special with a title schedule yields exactly one occurrence", () => {
    const result = generateSessionOccurrences({
      kind: "special",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: "2026-12-01",
      weekCount: 8,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.occurrences.length, 1);
      assert.equal(result.occurrences[0].startsAt, FIRST_START);
      assert.equal(result.occurrences[0].endsAt, FIRST_END);
    }
  });

  it("A2: regular + end date keeps the same weekday/time through the end date", () => {
    const result = generateSessionOccurrences({
      kind: "regular",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: "2026-10-01",
      weekCount: null,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.occurrences.length, 4);
      assert.equal(result.occurrences[0].startsAt, FIRST_START);
      assert.equal(result.occurrences[1].startsAt, "2026-09-17T10:00:00.000Z");
      assert.equal(result.occurrences[2].startsAt, "2026-09-24T10:00:00.000Z");
      assert.equal(result.occurrences[3].startsAt, "2026-10-01T10:00:00.000Z");
    }
  });

  it("A2: an end date between weekdays excludes the next week", () => {
    const result = generateSessionOccurrences({
      kind: "regular",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: "2026-09-30",
      weekCount: null,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.occurrences.length, 3);
    }
  });

  it("A3: regular + week count only yields exactly N sessions including the first", () => {
    const result = generateSessionOccurrences({
      kind: "regular",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: null,
      weekCount: 4,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.occurrences.length, 4);
    }
  });

  it("A3: week count 1 is only the first occurrence", () => {
    const result = generateSessionOccurrences({
      kind: "regular",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: null,
      weekCount: 1,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.occurrences.length, 1);
      assert.equal(result.occurrences[0].startsAt, FIRST_START);
    }
  });

  it("A3/A4: end date and week count together are rejected (mutex)", () => {
    const result = generateSessionOccurrences({
      kind: "regular",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: "2026-10-01",
      weekCount: 4,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorKey, "recurrenceMutex");
    }
  });

  it("A4: neither end date nor week count is a validation error with no occurrences", () => {
    const result = generateSessionOccurrences({
      kind: "regular",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: null,
      weekCount: null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorKey, "recurrenceBoundRequired");
    }
  });

  it("A5: cup and league use the same recurrence engine", () => {
    const cup = generateSessionOccurrences({
      kind: "cup",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: null,
      weekCount: 3,
    });
    const league = generateSessionOccurrences({
      kind: "league",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: "2026-10-01",
      weekCount: null,
    });
    assert.equal(cup.ok, true);
    assert.equal(league.ok, true);
    if (cup.ok) {
      assert.equal(cup.occurrences.length, 3);
    }
    if (league.ok) {
      assert.equal(league.occurrences.length, 4);
    }
  });

  it("rejects more than 52 weeks by count", () => {
    const result = generateSessionOccurrences({
      kind: "regular",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: null,
      weekCount: 53,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorKey, "invalidWeekCount");
    }
  });

  it("rejects an end date that would generate more than 52 occurrences", () => {
    const result = generateSessionOccurrences({
      kind: "regular",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: "2027-09-16",
      weekCount: null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorKey, "tooManyOccurrences");
    }
  });

  it("allows exactly 52 occurrences by week count and by end date", () => {
    const byWeeks = generateSessionOccurrences({
      kind: "regular",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: null,
      weekCount: MAX_SERIES_OCCURRENCES,
    });
    assert.equal(byWeeks.ok, true);
    if (byWeeks.ok) {
      assert.equal(byWeeks.occurrences.length, 52);
    }

    const byUntil = generateSessionOccurrences({
      kind: "regular",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: "2027-09-02",
      weekCount: null,
    });
    assert.equal(byUntil.ok, true);
    if (byUntil.ok) {
      assert.equal(byUntil.occurrences.length, 52);
    }
  });

  it("rejects an end date before the first start calendar day", () => {
    const result = generateSessionOccurrences({
      kind: "regular",
      startsAt: FIRST_START,
      endsAt: FIRST_END,
      untilDate: "2026-09-09",
      weekCount: null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorKey, "untilBeforeStart");
    }
  });
});
