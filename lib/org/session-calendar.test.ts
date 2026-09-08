import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminSessionsHref,
  calendarFetchDateRange,
  calendarHrefPath,
  calendarListHref,
  clubRangeToTimestamptz,
  defaultDayForMonth,
  defaultUpcomingListWindow,
  expandListDateWindow,
  groupSessionsByClubDate,
  groupSessionsByTeam,
  isDateInClubWeek,
  isDefaultUpcomingListWindow,
  LIST_WINDOW_DAYS,
  listWindowHref,
  monthGrid,
  parseAdminSessionsQuery,
  parseListDateWindow,
  resolveSurfaceKinds,
  sessionsInWeek,
  sessionsListOrCalendarBounds,
  shiftClubDate,
  uniqueAgeBandAbbrevsOnDate,
  uniqueKindsOnDate,
  visibleMonthRange,
  weekRangeForDate,
} from "./session-calendar.ts";
import { TRAINING_SESSION_KINDS } from "./session-recurrence.ts";
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

  it("honours defaultView list for parent-style surfaces", () => {
    const query = parseAdminSessionsQuery({}, now, {
      allowedKinds: TRAINING_SESSION_KINDS,
      defaultView: "list",
    });
    assert.equal(query.view, "list");
    assert.equal(
      parseAdminSessionsQuery({ view: "calendar" }, now, { defaultView: "list" }).view,
      "calendar",
    );
  });

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

describe("calendarHrefPath T6P1-7/8", () => {
  it("emits a string href with view=calendar for parent surfaces", () => {
    const href = calendarHrefPath(
      calendarListHref("/app/sessions", {
        year: 2026,
        month: 9,
        day: "2026-09-08",
        view: "calendar",
        kinds: [],
        teamIds: [],
        includeDeleted: false,
      }),
    );
    assert.equal(href.startsWith("/app/sessions?"), true);
    assert.match(href, /view=calendar/);
    assert.match(href, /month=2026-09/);
    const competitions = calendarHrefPath(
      calendarListHref("/app/competitions", {
        year: 2026,
        month: 9,
        day: "2026-09-08",
        view: "calendar",
        kinds: [],
        teamIds: [],
        includeDeleted: false,
      }),
    );
    assert.match(competitions, /^\/app\/competitions\?/);
    assert.match(competitions, /view=calendar/);
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
        view: "calendar",
        kind: ["regular", "league"],
        team: ["team-1"],
        includeDeleted: "1",
      },
    });
  });

  it("T6P1-1 training surface never lists cup/league/friendly", () => {
    const now = new Date("2026-09-04T01:00:00.000Z");
    const query = parseAdminSessionsQuery(
      { kind: ["cup", "league", "friendly", "regular"] },
      now,
      { allowedKinds: TRAINING_SESSION_KINDS },
    );
    assert.deepEqual(query.kinds, ["regular"]);
    assert.deepEqual(resolveSurfaceKinds([], TRAINING_SESSION_KINDS), ["regular", "special"]);
    assert.equal(resolveSurfaceKinds([], TRAINING_SESSION_KINDS).includes("cup"), false);
    assert.equal(resolveSurfaceKinds(["league"], TRAINING_SESSION_KINDS).includes("league"), false);
    const matchesHref = calendarListHref("/app/admin/matches", {
      year: 2026,
      month: 9,
      day: "2026-09-10",
      view: "list",
      kinds: ["friendly"],
      teamIds: [],
      includeDeleted: false,
    });
    assert.equal(matchesHref.pathname, "/app/admin/matches");
    assert.equal(matchesHref.query.view, "list");
    assert.deepEqual(matchesHref.query.kind, ["friendly"]);
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

describe("club week (Monday–Sunday, Asia/Taipei)", () => {
  it("selects the ISO week that contains the clicked day", () => {
    // Friday 4 Sep 2026 → Mon 31 Aug … Sun 6 Sep
    assert.deepEqual(weekRangeForDate("2026-09-04"), {
      from: "2026-08-31",
      to: "2026-09-06",
    });
    assert.deepEqual(weekRangeForDate("2026-08-31"), {
      from: "2026-08-31",
      to: "2026-09-06",
    });
    assert.deepEqual(weekRangeForDate("2026-09-06"), {
      from: "2026-08-31",
      to: "2026-09-06",
    });
    assert.equal(isDateInClubWeek("2026-09-04", "2026-09-01"), true);
    assert.equal(isDateInClubWeek("2026-09-07", "2026-09-04"), false);
  });

  it("lists the week’s sessions in starts_at order, not only the clicked day", () => {
    const weekRows: CalendarSession[] = [
      session({
        id: "sun-prev",
        starts_at: "2026-08-30T18:00:00+08:00",
        kind: "regular",
      }),
      session({
        id: "mon",
        starts_at: "2026-08-31T18:00:00+08:00",
        kind: "regular",
      }),
      session({
        id: "fri-late",
        starts_at: "2026-09-04T19:00:00+08:00",
        kind: "cup",
      }),
      session({
        id: "fri-early",
        starts_at: "2026-09-04T17:00:00+08:00",
        kind: "special",
      }),
      session({
        id: "sun",
        starts_at: "2026-09-06T09:00:00+08:00",
        kind: "league",
      }),
      session({
        id: "next-mon",
        starts_at: "2026-09-07T18:00:00+08:00",
        kind: "regular",
      }),
    ];
    assert.deepEqual(
      sessionsInWeek(weekRows, "2026-09-04").map((row) => row.id),
      ["mon", "fri-early", "fri-late", "sun"],
    );
    assert.deepEqual(
      groupSessionsByClubDate(sessionsInWeek(weekRows, "2026-09-04")).map((group) => [
        group.date,
        group.sessions.map((row) => row.id),
      ]),
      [
        ["2026-08-31", ["mon"]],
        ["2026-09-04", ["fri-early", "fri-late"]],
        ["2026-09-06", ["sun"]],
      ],
    );
  });

  it("shifts the selected day by a week and updates the month", () => {
    assert.deepEqual(shiftClubDate("2026-09-04", -7), {
      year: 2026,
      month: 8,
      day: "2026-08-28",
    });
    assert.deepEqual(shiftClubDate("2026-09-04", 7), {
      year: 2026,
      month: 9,
      day: "2026-09-11",
    });
  });
});

describe("defaultDayForMonth", () => {
  it("keeps today when the displayed month contains it", () => {
    assert.equal(defaultDayForMonth(2026, 9, "2026-09-04"), "2026-09-04");
    assert.equal(defaultDayForMonth(2026, 10, "2026-09-04"), "2026-10-01");
  });
});

describe("list date window (Stage Perf / 6Q)", () => {
  const now = new Date("2026-09-08T01:00:00.000Z");

  it("defaults to start of today through +8 weeks in Asia/Taipei", () => {
    const window = defaultUpcomingListWindow(now);
    assert.equal(LIST_WINDOW_DAYS, 56);
    assert.deepEqual(window, { from: "2026-09-08", to: "2026-11-03" });
    assert.equal(isDefaultUpcomingListWindow(window, now), true);
    const bounds = clubRangeToTimestamptz(window.from, window.to);
    assert.deepEqual(bounds, {
      from: "2026-09-08T00:00:00+08:00",
      toExclusive: "2026-11-04T00:00:00+08:00",
    });
  });

  it("parses from/to and rejects an inverted range", () => {
    assert.deepEqual(parseListDateWindow({ from: "2026-08-01", to: "2026-10-01" }, now), {
      from: "2026-08-01",
      to: "2026-10-01",
    });
    assert.deepEqual(parseListDateWindow({ from: "2026-12-01", to: "2026-10-01" }, now), {
      from: "2026-09-08",
      to: "2026-11-03",
    });
    assert.deepEqual(parseListDateWindow({}, now), { from: "2026-09-08", to: "2026-11-03" });
  });

  it("expands 8 weeks earlier or later without dropping the other edge", () => {
    const window = { from: "2026-09-08", to: "2026-11-03" };
    assert.deepEqual(expandListDateWindow(window, "earlier"), {
      from: "2026-07-14",
      to: "2026-11-03",
    });
    assert.deepEqual(expandListDateWindow(window, "later"), {
      from: "2026-09-08",
      to: "2026-12-29",
    });
  });

  it("calendar fetch is the visible month grid plus week padding, not a season dump", () => {
    const query = parseAdminSessionsQuery(
      { month: "2026-09", day: "2026-09-08", view: "calendar" },
      now,
    );
    assert.deepEqual(calendarFetchDateRange(query), {
      from: "2026-08-31",
      to: "2026-10-04",
    });
    const october = parseAdminSessionsQuery(
      { month: "2026-10", day: "2026-10-01", view: "calendar" },
      now,
    );
    const octoberRange = calendarFetchDateRange(october);
    assert.equal(octoberRange.from <= "2026-10-01", true);
    assert.equal(octoberRange.to >= "2026-10-31", true);
    assert.equal(octoberRange.from >= "2026-09-28", true);
    assert.equal(octoberRange.to <= "2026-11-08", true);
    const calendarBounds = sessionsListOrCalendarBounds(october, defaultUpcomingListWindow(now));
    const listBounds = sessionsListOrCalendarBounds(
      { ...october, view: "list" },
      defaultUpcomingListWindow(now),
    );
    assert.notDeepEqual(calendarBounds, listBounds);
    assert.equal(calendarBounds.from.startsWith("2026-09-28"), true);
    assert.equal(listBounds.from, "2026-09-08T00:00:00+08:00");
  });

  it("omits from/to on the default upcoming list href", () => {
    const query = parseAdminSessionsQuery({ view: "list" }, now, { defaultView: "list" });
    const href = listWindowHref(
      "/app/sessions",
      query,
      defaultUpcomingListWindow(now),
      now,
    );
    assert.equal(href.query.from, undefined);
    assert.equal(href.query.to, undefined);
    const expanded = listWindowHref(
      "/app/sessions",
      query,
      expandListDateWindow(defaultUpcomingListWindow(now), "later"),
      now,
    );
    assert.equal(expanded.query.from, "2026-09-08");
    assert.equal(expanded.query.to, "2026-12-29");
  });
});
