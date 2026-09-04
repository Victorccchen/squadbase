/**
 * Weekly occurrence math for Stage 4A / 4A.1 session series.
 *
 * Club wall time is Asia/Taipei (no DST).
 *
 * Recurring kinds (regular, cup, league) require end date XOR week count.
 * special always yields exactly one occurrence.
 *
 * Weekdays use ISO-8601: 1=Monday … 7=Sunday.
 * Week-count N = N occurrences per selected weekday, including the first
 * of that weekday on or after the series start date. Total occurrences
 * are the sum across weekdays and must be ≤ 52.
 *
 * Until-date: every calendar date in [seriesStart, untilDate] whose
 * weekday is selected, at the chosen time of day.
 *
 * If weekdays is omitted (null/undefined), infer a one-element array from
 * startsAt (Stage 4A single-weekday callers). An explicit empty list is an error.
 */

import {
  parseClubDateTimeLocal,
  toDateTimeLocalInput,
} from "./session-time.ts";

export const SESSION_KINDS = ["regular", "special", "cup", "league"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const RECURRING_SESSION_KINDS = ["regular", "cup", "league"] as const;
export type RecurringSessionKind = (typeof RECURRING_SESSION_KINDS)[number];

/** ISO-8601 weekday numbers: 1=Monday … 7=Sunday. */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type IsoWeekday = (typeof ISO_WEEKDAYS)[number];

export const MAX_SERIES_OCCURRENCES = 52;
export const MIN_WEEK_COUNT = 1;
export const MAX_SESSION_TITLE = 200;

export type RecurrenceErrorKey =
  | "recurrenceMutex"
  | "recurrenceBoundRequired"
  | "invalidWeekCount"
  | "invalidUntilDate"
  | "untilBeforeStart"
  | "tooManyOccurrences"
  | "weekdayRequired"
  | "invalidWeekdays";

export type SessionOccurrence = {
  startsAt: string;
  endsAt: string;
};

export type RecurrenceInput = {
  kind: SessionKind;
  startsAt: string;
  endsAt: string;
  untilDate: string | null;
  weekCount: number | null;
  /**
   * ISO weekdays 1=Mon … 7=Sun.
   * null/undefined → infer from startsAt (legacy single-weekday).
   * [] → weekdayRequired.
   */
  weekdays?: readonly number[] | null;
};

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isSessionKind(value: string): value is SessionKind {
  return (SESSION_KINDS as readonly string[]).includes(value);
}

export function isRecurringSessionKind(value: string): value is RecurringSessionKind {
  return (RECURRING_SESSION_KINDS as readonly string[]).includes(value);
}

export function parseSessionKind(value: string): SessionKind | null {
  return isSessionKind(value) ? value : null;
}

export function isIsoWeekday(value: number): value is IsoWeekday {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

export function parseIsoWeekday(value: string): IsoWeekday | null {
  if (!/^[1-7]$/.test(value.trim())) {
    return null;
  }
  return Number(value.trim()) as IsoWeekday;
}

/**
 * Parse weekday form/RPC values. Accepts repeated fields or comma-separated
 * ISO numbers. Returns [] when nothing was selected (caller should error).
 * Returns null when a token is present but invalid.
 */
export function parseWeekdays(values: readonly string[]): IsoWeekday[] | null {
  const unique = new Set<IsoWeekday>();
  let sawToken = false;
  for (const value of values) {
    for (const part of value.split(/[,\s]+/)) {
      const trimmed = part.trim();
      if (!trimmed) {
        continue;
      }
      sawToken = true;
      const parsed = parseIsoWeekday(trimmed);
      if (parsed === null) {
        return null;
      }
      unique.add(parsed);
    }
  }
  if (!sawToken) {
    return [];
  }
  return [...unique].sort((a, b) => a - b);
}

export function normalizeWeekdays(
  values: readonly number[] | null | undefined,
):
  | { ok: true; weekdays: IsoWeekday[] | null }
  | { ok: false; errorKey: "weekdayRequired" | "invalidWeekdays" } {
  if (values == null) {
    return { ok: true, weekdays: null };
  }
  if (values.length === 0) {
    return { ok: false, errorKey: "weekdayRequired" };
  }
  const unique = new Set<IsoWeekday>();
  for (const value of values) {
    if (!isIsoWeekday(value)) {
      return { ok: false, errorKey: "invalidWeekdays" };
    }
    unique.add(value);
  }
  if (unique.size === 0) {
    return { ok: false, errorKey: "weekdayRequired" };
  }
  return { ok: true, weekdays: [...unique].sort((a, b) => a - b) };
}

export function parseWeekCount(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) {
    return null;
  }
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n < MIN_WEEK_COUNT || n > MAX_SERIES_OCCURRENCES) {
    return null;
  }
  return n;
}

export function parseUntilDate(value: string): string | null {
  const trimmed = value.trim();
  const match = ISO_DATE_RE.exec(trimmed);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
}

export function clubCalendarDate(iso: string): string {
  return toDateTimeLocalInput(iso).slice(0, 10);
}

export function formatCalendarDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseCalendarDateParts(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_RE.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** ISO weekday of a YYYY-MM-DD club calendar date (date-only, not a timestamptz). */
export function isoWeekdayFromCalendarDate(date: string): IsoWeekday | null {
  const parts = parseCalendarDateParts(date);
  if (!parts) {
    return null;
  }
  const jsDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return (jsDay === 0 ? 7 : jsDay) as IsoWeekday;
}

export function isoWeekdayFromClubInstant(iso: string): IsoWeekday | null {
  const date = clubCalendarDate(iso);
  if (!date) {
    return null;
  }
  return isoWeekdayFromCalendarDate(date);
}

export function addCalendarDays(date: string, days: number): string | null {
  if (!Number.isInteger(days)) {
    return null;
  }
  const parts = parseCalendarDateParts(date);
  if (!parts) {
    return null;
  }
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return formatCalendarDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function firstWeekdayOnOrAfter(startDate: string, weekday: IsoWeekday): string | null {
  const current = isoWeekdayFromCalendarDate(startDate);
  if (current === null) {
    return null;
  }
  const delta = (weekday - current + 7) % 7;
  return addCalendarDays(startDate, delta);
}

export function addDaysToOffsetIso(iso: string, days: number): string | null {
  if (!Number.isInteger(days)) {
    return null;
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms + days * 86_400_000).toISOString();
}

function clubTimeOfDay(iso: string): string | null {
  const local = toDateTimeLocalInput(iso);
  if (local.length < 16) {
    return null;
  }
  return local.slice(11);
}

/**
 * Build an occurrence on a club calendar date using the time-of-day and
 * duration of the template timestamps. When the date matches the template's
 * club date, reuse the original strings.
 */
export function occurrenceOnClubDate(
  templateStart: string,
  templateEnd: string,
  clubDate: string,
): SessionOccurrence | null {
  if (clubCalendarDate(templateStart) === clubDate) {
    return { startsAt: templateStart, endsAt: templateEnd };
  }

  const time = clubTimeOfDay(templateStart);
  if (!time) {
    return null;
  }
  const startsAtLocal = parseClubDateTimeLocal(`${clubDate}T${time}`);
  if (!startsAtLocal) {
    return null;
  }
  const durationMs = Date.parse(templateEnd) - Date.parse(templateStart);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  const startsMs = Date.parse(startsAtLocal);
  if (Number.isNaN(startsMs)) {
    return null;
  }
  return {
    startsAt: new Date(startsMs).toISOString(),
    endsAt: new Date(startsMs + durationMs).toISOString(),
  };
}

function sortOccurrences(occurrences: SessionOccurrence[]): SessionOccurrence[] {
  return [...occurrences].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/**
 * Pure recurrence generator. Does not write to the database.
 * The admin create RPC must apply the same rules.
 */
export function generateSessionOccurrences(
  input: RecurrenceInput,
):
  | { ok: true; occurrences: SessionOccurrence[] }
  | { ok: false; errorKey: RecurrenceErrorKey } {
  if (input.kind === "special") {
    return {
      ok: true,
      occurrences: [{ startsAt: input.startsAt, endsAt: input.endsAt }],
    };
  }

  const hasUntil = input.untilDate !== null && input.untilDate.length > 0;
  const hasWeeks = input.weekCount !== null;

  if (hasUntil && hasWeeks) {
    return { ok: false, errorKey: "recurrenceMutex" };
  }
  if (!hasUntil && !hasWeeks) {
    return { ok: false, errorKey: "recurrenceBoundRequired" };
  }

  const normalized = normalizeWeekdays(input.weekdays);
  if (!normalized.ok) {
    return { ok: false, errorKey: normalized.errorKey };
  }

  let weekdays = normalized.weekdays;
  if (weekdays === null) {
    const inferred = isoWeekdayFromClubInstant(input.startsAt);
    if (inferred === null) {
      return { ok: false, errorKey: "invalidWeekdays" };
    }
    weekdays = [inferred];
  }

  const startDate = clubCalendarDate(input.startsAt);
  if (!parseCalendarDateParts(startDate)) {
    return { ok: false, errorKey: "invalidUntilDate" };
  }

  if (hasWeeks) {
    const weekCount = input.weekCount;
    if (
      weekCount === null ||
      !Number.isInteger(weekCount) ||
      weekCount < MIN_WEEK_COUNT ||
      weekCount > MAX_SERIES_OCCURRENCES
    ) {
      return { ok: false, errorKey: "invalidWeekCount" };
    }
    if (weekCount * weekdays.length > MAX_SERIES_OCCURRENCES) {
      return { ok: false, errorKey: "tooManyOccurrences" };
    }

    const occurrences: SessionOccurrence[] = [];
    for (const weekday of weekdays) {
      const firstDate = firstWeekdayOnOrAfter(startDate, weekday);
      if (!firstDate) {
        return { ok: false, errorKey: "invalidWeekdays" };
      }
      for (let i = 0; i < weekCount; i += 1) {
        const date = addCalendarDays(firstDate, i * 7);
        if (!date) {
          return { ok: false, errorKey: "invalidWeekCount" };
        }
        const occurrence = occurrenceOnClubDate(input.startsAt, input.endsAt, date);
        if (!occurrence) {
          return { ok: false, errorKey: "invalidWeekCount" };
        }
        occurrences.push(occurrence);
      }
    }
    return { ok: true, occurrences: sortOccurrences(occurrences) };
  }

  const untilDate = parseUntilDate(input.untilDate ?? "");
  if (!untilDate) {
    return { ok: false, errorKey: "invalidUntilDate" };
  }
  if (untilDate < startDate) {
    return { ok: false, errorKey: "untilBeforeStart" };
  }

  const occurrences: SessionOccurrence[] = [];
  let date: string | null = startDate;
  while (date && date <= untilDate) {
    const weekday = isoWeekdayFromCalendarDate(date);
    if (weekday !== null && weekdays.includes(weekday)) {
      if (occurrences.length >= MAX_SERIES_OCCURRENCES) {
        return { ok: false, errorKey: "tooManyOccurrences" };
      }
      const occurrence = occurrenceOnClubDate(input.startsAt, input.endsAt, date);
      if (!occurrence) {
        return { ok: false, errorKey: "invalidUntilDate" };
      }
      occurrences.push(occurrence);
    }
    date = addCalendarDays(date, 1);
  }

  if (occurrences.length === 0) {
    return { ok: false, errorKey: "untilBeforeStart" };
  }

  return { ok: true, occurrences: sortOccurrences(occurrences) };
}
