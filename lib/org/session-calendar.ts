/**
 * Admin month calendar helpers for Stage 4A.1.
 * Grid is Monday-first (ISO week). Dates are club calendar days (Asia/Taipei).
 */

import type { AgeBand, SessionKind, Team } from "../supabase/database.types.ts";
import { AGE_BANDS } from "../age-band.ts";
import {
  addCalendarDays,
  clubCalendarDate,
  formatCalendarDate,
  isoWeekdayFromCalendarDate,
  parseCalendarDateParts,
  parseSessionKind,
  SESSION_KINDS,
  type IsoWeekday,
} from "./session-recurrence.ts";
import { toDateTimeLocalInput } from "./session-time.ts";

export const TEAM_GROUP_ORDER = [...AGE_BANDS, "ungrouped"] as const;
export type TeamGroupKey = (typeof TEAM_GROUP_ORDER)[number];

export const AGE_BAND_ABBREV: Record<AgeBand, string> = {
  U6: "U6",
  U8: "U8",
  U10: "U10",
  U12: "U12",
  U15: "U15",
  U18: "U18",
  reserve: "Rsv",
  senior: "Sr",
};

export type CalendarCell = {
  date: string;
  inMonth: boolean;
  weekday: IsoWeekday;
  dayOfMonth: number;
};

export type AdminSessionsView = "calendar" | "list";

export type AdminSessionsQuery = {
  year: number;
  month: number;
  day: string;
  view: AdminSessionsView;
  kinds: SessionKind[];
  teamIds: string[];
  includeDeleted: boolean;
};

export type TeamAgendaGroup<T> = {
  teamId: string | null;
  teamName: string | null;
  ageBand: AgeBand | null;
  groupKey: TeamGroupKey;
  sessions: T[];
};

export type CalendarSession = {
  id: string;
  starts_at: string;
  kind: SessionKind;
  team: Pick<Team, "id" | "name" | "age_band"> | null;
};

export function clubTodayDate(now = new Date()): string {
  return toDateTimeLocalInput(now.toISOString()).slice(0, 10);
}

export function parseYearMonth(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftYearMonth(
  year: number,
  month: number,
  deltaMonths: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return { year: nextYear, month: nextMonth };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthGrid(year: number, month: number): CalendarCell[] {
  const first = formatCalendarDate(year, month, 1);
  const firstWeekday = isoWeekdayFromCalendarDate(first);
  if (firstWeekday === null) {
    return [];
  }
  const leading = firstWeekday - 1;
  const count = daysInMonth(year, month);
  const total = Math.ceil((leading + count) / 7) * 7;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < total; i += 1) {
    const date = addCalendarDays(first, i - leading);
    if (!date) {
      continue;
    }
    const parts = parseCalendarDateParts(date);
    const weekday = isoWeekdayFromCalendarDate(date);
    if (!parts || weekday === null) {
      continue;
    }
    cells.push({
      date,
      inMonth: parts.month === month,
      weekday,
      dayOfMonth: parts.day,
    });
  }
  return cells;
}

export function visibleMonthRange(
  year: number,
  month: number,
): { from: string; to: string } | null {
  const grid = monthGrid(year, month);
  if (grid.length === 0) {
    return null;
  }
  return { from: grid[0].date, to: grid[grid.length - 1].date };
}

/** Inclusive Taipei wall-time bounds for a YYYY-MM-DD range query on starts_at. */
export function clubRangeToTimestamptz(fromDate: string, toDate: string): {
  from: string;
  toExclusive: string;
} | null {
  const next = addCalendarDays(toDate, 1);
  if (!next || !parseCalendarDateParts(fromDate)) {
    return null;
  }
  return {
    from: `${fromDate}T00:00:00+08:00`,
    toExclusive: `${next}T00:00:00+08:00`,
  };
}

export function asParamList(value: string | string[] | undefined): string[] {
  if (value == null) {
    return [];
  }
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseAdminSessionsQuery(
  params: {
    month?: string | string[];
    day?: string | string[];
    view?: string | string[];
    kind?: string | string[];
    team?: string | string[];
    includeDeleted?: string | string[];
  },
  now = new Date(),
): AdminSessionsQuery {
  const today = clubTodayDate(now);
  const todayParts = parseCalendarDateParts(today);
  const monthRaw = Array.isArray(params.month) ? (params.month[0] ?? "") : (params.month ?? "");
  const parsedMonth = parseYearMonth(monthRaw);
  const year = parsedMonth?.year ?? todayParts?.year ?? now.getUTCFullYear();
  const month = parsedMonth?.month ?? todayParts?.month ?? 1;

  const dayRaw = Array.isArray(params.day) ? (params.day[0] ?? "") : (params.day ?? "");
  const parsedDay = parseCalendarDateParts(dayRaw.trim());
  let day = parsedDay ? dayRaw.trim() : "";
  if (!day) {
    const inThisMonth =
      todayParts !== null && todayParts.year === year && todayParts.month === month;
    day = inThisMonth ? today : formatCalendarDate(year, month, 1);
  }

  const viewRaw = Array.isArray(params.view) ? (params.view[0] ?? "") : (params.view ?? "");
  const view: AdminSessionsView = viewRaw === "list" ? "list" : "calendar";

  const kinds = asParamList(params.kind)
    .map(parseSessionKind)
    .filter((kind): kind is SessionKind => kind !== null);
  const uniqueKinds = SESSION_KINDS.filter((kind) => kinds.includes(kind));

  const teamIds = [...new Set(asParamList(params.team))];

  const deletedRaw = Array.isArray(params.includeDeleted)
    ? (params.includeDeleted[0] ?? "")
    : (params.includeDeleted ?? "");
  const includeDeleted = deletedRaw === "1";

  return { year, month, day, view, kinds: uniqueKinds, teamIds, includeDeleted };
}

export function adminSessionsHref(query: Partial<AdminSessionsQuery> & Pick<
  AdminSessionsQuery,
  "year" | "month" | "day" | "view" | "kinds" | "teamIds" | "includeDeleted"
>): {
  pathname: "/app/admin/sessions";
  query: Record<string, string | string[]>;
} {
  const search: Record<string, string | string[]> = {
    month: formatYearMonth(query.year, query.month),
    day: query.day,
  };
  if (query.view === "list") {
    search.view = "list";
  }
  if (query.kinds.length > 0) {
    search.kind = query.kinds;
  }
  if (query.teamIds.length > 0) {
    search.team = query.teamIds;
  }
  if (query.includeDeleted) {
    search.includeDeleted = "1";
  }
  return { pathname: "/app/admin/sessions", query: search };
}

export function sessionsOnDate<T extends { starts_at: string }>(
  sessions: readonly T[],
  date: string,
): T[] {
  return sessions.filter((session) => clubCalendarDate(session.starts_at) === date);
}

/** Monday–Sunday club week that contains `date` (Taiwan / ISO week). */
export function weekRangeForDate(date: string): { from: string; to: string } | null {
  const weekday = isoWeekdayFromCalendarDate(date);
  if (weekday === null) {
    return null;
  }
  const from = addCalendarDays(date, 1 - weekday);
  const to = addCalendarDays(date, 7 - weekday);
  if (!from || !to) {
    return null;
  }
  return { from, to };
}

export function isDateInClubWeek(date: string, weekDate: string): boolean {
  const range = weekRangeForDate(weekDate);
  if (!range) {
    return false;
  }
  return date >= range.from && date <= range.to;
}

export function sessionsInWeek<T extends { starts_at: string }>(
  sessions: readonly T[],
  date: string,
): T[] {
  const range = weekRangeForDate(date);
  if (!range) {
    return [];
  }
  return sessions
    .filter((session) => {
      const day = clubCalendarDate(session.starts_at);
      return day >= range.from && day <= range.to;
    })
    .slice()
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export function groupSessionsByClubDate<T extends { starts_at: string }>(
  sessions: readonly T[],
): { date: string; sessions: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const session of sessions) {
    const day = clubCalendarDate(session.starts_at);
    const list = buckets.get(day) ?? [];
    list.push(session);
    buckets.set(day, list);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rows]) => ({
      date: day,
      sessions: rows.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    }));
}

export function shiftClubDate(
  date: string,
  deltaDays: number,
): { year: number; month: number; day: string } | null {
  const next = addCalendarDays(date, deltaDays);
  if (!next) {
    return null;
  }
  const parts = parseCalendarDateParts(next);
  if (!parts) {
    return null;
  }
  return { year: parts.year, month: parts.month, day: next };
}

export function uniqueKindsOnDate(sessions: readonly CalendarSession[], date: string): SessionKind[] {
  const present = new Set<SessionKind>();
  for (const session of sessionsOnDate(sessions, date)) {
    present.add(session.kind);
  }
  return SESSION_KINDS.filter((kind) => present.has(kind));
}

export function uniqueAgeBandAbbrevsOnDate(
  sessions: readonly CalendarSession[],
  date: string,
): string[] {
  const present = new Set<string>();
  for (const session of sessionsOnDate(sessions, date)) {
    const band = session.team?.age_band;
    present.add(band ? AGE_BAND_ABBREV[band] : "?");
  }
  return [...present];
}

export function teamGroupKey(ageBand: string | null | undefined): TeamGroupKey {
  if (ageBand && (AGE_BANDS as readonly string[]).includes(ageBand)) {
    return ageBand as AgeBand;
  }
  return "ungrouped";
}

export function groupSessionsByTeam<
  T extends {
    starts_at: string;
    team: Pick<Team, "id" | "name" | "age_band"> | null;
  },
>(sessions: readonly T[]): TeamAgendaGroup<T>[] {
  const buckets = new Map<string, TeamAgendaGroup<T>>();
  for (const session of sessions) {
    const teamId = session.team?.id ?? null;
    const key = teamId ?? "ungrouped";
    let group = buckets.get(key);
    if (!group) {
      group = {
        teamId,
        teamName: session.team?.name ?? null,
        ageBand: session.team?.age_band ?? null,
        groupKey: teamGroupKey(session.team?.age_band),
        sessions: [],
      };
      buckets.set(key, group);
    }
    group.sessions.push(session);
  }

  const groups = [...buckets.values()];
  for (const group of groups) {
    group.sessions.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  }
  groups.sort((a, b) => {
    const order = TEAM_GROUP_ORDER.indexOf(a.groupKey) - TEAM_GROUP_ORDER.indexOf(b.groupKey);
    if (order !== 0) {
      return order;
    }
    return (a.teamName ?? "").localeCompare(b.teamName ?? "");
  });
  return groups;
}

export function defaultDayForMonth(
  year: number,
  month: number,
  today = clubTodayDate(),
): string {
  const todayParts = parseCalendarDateParts(today);
  if (todayParts && todayParts.year === year && todayParts.month === month) {
    return today;
  }
  return formatCalendarDate(year, month, 1);
}
