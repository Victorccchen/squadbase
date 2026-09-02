import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ageBandFromBirthDate,
  completedAgeYears,
  formatIsoDate,
  getSeasonStart,
  parseIsoDate,
  type CalendarDate,
} from "./age-band.ts";

function d(year: number, month: number, day: number): CalendarDate {
  return { year, month, day };
}

describe("parseIsoDate", () => {
  it("accepts a real calendar date", () => {
    assert.deepEqual(parseIsoDate("2020-08-15"), d(2020, 8, 15));
  });

  it("rejects impossible dates", () => {
    assert.equal(parseIsoDate("2020-02-30"), null);
    assert.equal(parseIsoDate("2020/08/15"), null);
  });
});

describe("getSeasonStart (T2-4 Aug 15 cutover)", () => {
  it("uses this year's 15 Aug on the cutover day", () => {
    assert.deepEqual(getSeasonStart(d(2026, 8, 15)), d(2026, 8, 15));
  });

  it("uses this year's 15 Aug after the cutover", () => {
    assert.deepEqual(getSeasonStart(d(2026, 12, 1)), d(2026, 8, 15));
  });

  it("uses last year's 15 Aug the day before the cutover", () => {
    assert.deepEqual(getSeasonStart(d(2026, 8, 14)), d(2025, 8, 15));
  });

  it("uses last year's 15 Aug in the first half of the year", () => {
    assert.deepEqual(getSeasonStart(d(2026, 1, 1)), d(2025, 8, 15));
  });
});

describe("ageBandFromBirthDate around the Aug 15 birthday boundary", () => {
  it("U6 → U8 exactly on the 6th birthday at season start", () => {
    // Born 15 Aug 2020; season start 15 Aug 2026 → age 6 → U8
    assert.equal(ageBandFromBirthDate("2020-08-15", "2026-08-15"), "U8");
  });

  it("stays U6 the day before a 15 Aug birthday", () => {
    // Same child, as-of 14 Aug 2026 still uses season start 15 Aug 2025 → age 5 → U6
    assert.equal(ageBandFromBirthDate("2020-08-15", "2026-08-14"), "U6");
  });

  it("born the day after 15 Aug is still younger on season start", () => {
    // Born 16 Aug 2020; season start 15 Aug 2026 → still 5 → U6
    assert.equal(ageBandFromBirthDate("2020-08-16", "2026-08-15"), "U6");
  });

  it("maps each youth band and senior at 18", () => {
    const asOf = "2026-08-15";
    assert.equal(ageBandFromBirthDate("2021-08-15", asOf), "U6"); // age 5
    assert.equal(ageBandFromBirthDate("2019-08-15", asOf), "U8"); // age 7
    assert.equal(ageBandFromBirthDate("2018-08-15", asOf), "U10"); // age 8
    assert.equal(ageBandFromBirthDate("2016-08-15", asOf), "U12"); // age 10
    assert.equal(ageBandFromBirthDate("2015-08-15", asOf), "U12"); // age 11
    assert.equal(ageBandFromBirthDate("2014-08-15", asOf), "U15"); // age 12
    assert.equal(ageBandFromBirthDate("2011-08-15", asOf), "U18"); // age 15
    assert.equal(ageBandFromBirthDate("2008-08-15", asOf), "senior"); // age 18
    assert.equal(ageBandFromBirthDate("2008-08-16", asOf), "U18"); // age 17
  });

  it("never returns reserve (team classification only)", () => {
    assert.notEqual(ageBandFromBirthDate("1990-01-01", "2026-08-15"), "reserve");
  });
});

describe("completedAgeYears", () => {
  it("is 7 until the birthday on season start", () => {
    assert.equal(completedAgeYears(d(2018, 8, 16), d(2026, 8, 15)), 7);
    assert.equal(completedAgeYears(d(2018, 8, 15), d(2026, 8, 15)), 8);
  });
});

describe("formatIsoDate", () => {
  it("zero-pads month and day", () => {
    assert.equal(formatIsoDate(d(2026, 8, 5)), "2026-08-05");
  });
});
