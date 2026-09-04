import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminSessionsHref,
  defaultDayForMonth,
  groupSessionsByTeam,
  monthGrid,
  parseAdminSessionsQuery,
  uniqueAgeBandAbbrevsOnDate,
  uniqueKindsOnDate,
  visibleMonthRange,
} from "./session-calendar.ts";
import type { CalendarSession } from "./session-calendar.ts";

function session(
  overrides: Partial<CalendarSession> & Pick<CalendarSession, "id" | "starts_at" | "kind">,
): CalendarSession {
  return {
    team: overrides.team ?? {
      id: "team-u8",
      name: "U8 Lions",
      age_band: "U8",
    },
    ...overrides,
  };
}

describe("monthGrid", () => {
  it("starts on Monday and includes leading/trailing days", () => {
    const grid = monthGrid(2026, 9);
    assert.equal(grid[0].weekday, 1);
    assert.equal(grid[0].date, "2026-08-31");
    assert.equal(grid[0].inMonth, false);
    const firstSep = grid.find((cell) => cell.date === "2026-09-01");
    assert.equal(firstSep?.weekday, 2);
    assert.equal(firstSep?.inMonth, true);
    const range = visibleMonthRange(2026, 9);
    assert.equal(range?.from, "2026-08-31");
    assert.equal(range?.to, "2026-10-04");
  });
});

describe("parseAdminSessionsQuery", () => {
  const now = new Date("2026-09-04T01:00:00.000Z");

  it("defaults to calendar view, today, and the club month", () => {
    const query = parseAdminSessionsQuery({}, now);
    assert.equal(query.view, "calendar");
    assert.equal(query.year, 2026);
    assert.equal(query.month, 9);
    assert.equal(query.day, "2026-09-04");
    assert.deepEqual(query.kinds, []);
    assert.equal(query.includeDeleted, false);
  });

  it("parses multi kind/team filters and list view", () => {
    const query = parseAdminSessionsQuery(
      {
        month: "2026-10",
        day: "2026-10-08",
        view: "list",
        kind: ["regular", "cup"],
        team: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        includeDeleted: "1",
      },
      now,
    );
    assert.equal(query.view, "list");
    assert.equal(query.month, 10);
    assert.equal(query.day, "2026-10-08");
    assert.deepEqual(query.kinds, ["regular", "cup"]);
    assert.deepEqual(query.teamIds, ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]);
    assert.equal(query.includeDeleted, true);
  });
});

describe("adminSessionsHref", () => {
  it("keeps month/day and repeated filters", () => {
    const href = adminSessionsHref({
      year: 2026,
      month: 9,
      day: "2026-09-10",
      view: "calendar",
      kinds: ["regular", "league"],
      teamIds: ["team-1"],
      includeDeleted: true,
    });
    assert.deepEqual(href, {
      pathname: "/app/admin/sessions",
      query: {
        month: "2026-09",
        day: "2026-09-10",
        kind: ["regular", "league"],
        team: ["team-1"],
        includeDeleted: "1",
      },
    });
  });
});

describe("calendar day dots and agenda grouping", () => {
  const rows: CalendarSession[] = [
    session({
      id: "a",
      starts_at: "2026-09-10T18:00:00+08:00",
      kind: "regular",
      team: { id: "u8", name: "U8 Lions", age_band: "U8" },
    }),
    session({
      id: "b",
      starts_at: "2026-09-10T19:00:00+08:00",
      kind: "cup",
      team: { id: "u10", name: "U10 Tigers", age_band: "U10" },
    }),
    session({
      id: "c",
      starts_at: "2026-09-10T17:00:00+08:00",
      kind: "regular",
      team: { id: "senior", name: "Adults", age_band: "senior" },
    }),
    session({
      id: "d",
      starts_at: "2026-09-11T18:00:00+08:00",
      kind: "special",
      team: { id: "u8", name: "U8 Lions", age_band: "U8" },
    }),
  ];

  it("shows unique kind dots and age-band abbreviations for a day", () => {
    assert.deepEqual(uniqueKindsOnDate(rows, "2026-09-10"), ["regular", "cup"]);
    assert.deepEqual(uniqueAgeBandAbbrevsOnDate(rows, "2026-09-10"), ["U8", "U10", "Sr"]);
    assert.deepEqual(uniqueKindsOnDate(rows, "2026-09-11"), ["special"]);
    assert.deepEqual(uniqueKindsOnDate(rows, "2026-09-12"), []);
  });

  it("groups the right-hand agenda by team, ordered U bands then adult", () => {
    const day = rows.filter((row) => row.starts_at.startsWith("2026-09-10"));
    const groups = groupSessionsByTeam(day);
    assert.deepEqual(
      groups.map((group) => [group.groupKey, group.teamName, group.sessions.map((row) => row.id)]),
      [
        ["U8", "U8 Lions", ["a"]],
        ["U10", "U10 Tigers", ["b"]],
        ["senior", "Adults", ["c"]],
      ],
    );
  });
});

describe("defaultDayForMonth", () => {
  it("keeps today when the displayed month contains it", () => {
    assert.equal(defaultDayForMonth(2026, 9, "2026-09-04"), "2026-09-04");
    assert.equal(defaultDayForMonth(2026, 10, "2026-09-04"), "2026-10-01");
  });
});
