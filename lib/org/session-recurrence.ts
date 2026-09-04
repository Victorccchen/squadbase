/**
 * Weekly occurrence math for Stage 4A session series.
 *
 * Club wall time is Asia/Taipei (no DST), so adding 7 * 24h matches
 * PostgreSQL `timestamptz + interval '7 days'`.
 *
 * N weeks = N occurrences including the first.
 * Recurring kinds (regular, cup, league) require end date XOR week count.
 * special always yields exactly one occurrence.
 */

import { toDateTimeLocalInput } from "./session-time.ts";

export const SESSION_KINDS = ["regular", "special", "cup", "league"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const RECURRING_SESSION_KINDS = ["regular", "cup", "league"] as const;
export type RecurringSessionKind = (typeof RECURRING_SESSION_KINDS)[number];

export const MAX_SERIES_OCCURRENCES = 52;
export const MIN_WEEK_COUNT = 1;
export const MAX_SESSION_TITLE = 200;

export type RecurrenceErrorKey =
  | "recurrenceMutex"
  | "recurrenceBoundRequired"
  | "invalidWeekCount"
  | "invalidUntilDate"
  | "untilBeforeStart"
  | "tooManyOccurrences";

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

function occurrenceAtWeek(startsAt: string, endsAt: string, weekIndex: number): SessionOccurrence | null {
  if (weekIndex === 0) {
    return { startsAt, endsAt };
  }
  const nextStart = addDaysToOffsetIso(startsAt, weekIndex * 7);
  const nextEnd = addDaysToOffsetIso(endsAt, weekIndex * 7);
  if (!nextStart || !nextEnd) {
    return null;
  }
  return { startsAt: nextStart, endsAt: nextEnd };
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
    const occurrences: SessionOccurrence[] = [];
    for (let i = 0; i < weekCount; i += 1) {
      const occurrence = occurrenceAtWeek(input.startsAt, input.endsAt, i);
      if (!occurrence) {
        return { ok: false, errorKey: "invalidWeekCount" };
      }
      occurrences.push(occurrence);
    }
    return { ok: true, occurrences };
  }

  const untilDate = parseUntilDate(input.untilDate ?? "");
  if (!untilDate) {
    return { ok: false, errorKey: "invalidUntilDate" };
  }

  const firstDate = clubCalendarDate(input.startsAt);
  if (!firstDate || untilDate < firstDate) {
    return { ok: false, errorKey: "untilBeforeStart" };
  }

  const occurrences: SessionOccurrence[] = [];
  for (let i = 0; i <= MAX_SERIES_OCCURRENCES; i += 1) {
    const occurrence = occurrenceAtWeek(input.startsAt, input.endsAt, i);
    if (!occurrence) {
      return { ok: false, errorKey: "invalidUntilDate" };
    }
    const occurrenceDate = clubCalendarDate(occurrence.startsAt);
    if (!occurrenceDate || occurrenceDate > untilDate) {
      break;
    }
    if (occurrences.length >= MAX_SERIES_OCCURRENCES) {
      return { ok: false, errorKey: "tooManyOccurrences" };
    }
    occurrences.push(occurrence);
  }

  if (occurrences.length === 0) {
    return { ok: false, errorKey: "untilBeforeStart" };
  }

  return { ok: true, occurrences };
}
