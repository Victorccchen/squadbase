/**
 * Season age-band helper.
 *
 * Club seasons cut over every year on 15 August. Age band is the player's
 * completed age on that season-start date, not on “today” during the season.
 *
 * Mapping (completed age on season start → band):
 *   0–5  U6
 *   6–7  U8
 *   8–9  U10
 *   10–11 U12
 *   12–14 U15
 *   15–17 U18
 *   18+   senior
 *
 * `reserve` is a team classification (e.g. reserve squad), not computed from
 * date of birth. The helper never returns `reserve`.
 *
 * Default “as of” calendar date uses Asia/Taipei (club local time).
 */

export const AGE_BANDS = [
  "U6",
  "U8",
  "U10",
  "U12",
  "U15",
  "U18",
  "reserve",
  "senior",
] as const;

export type AgeBand = (typeof AGE_BANDS)[number];

export const COMPUTED_AGE_BANDS = [
  "U6",
  "U8",
  "U10",
  "U12",
  "U15",
  "U18",
  "senior",
] as const;

export type ComputedAgeBand = (typeof COMPUTED_AGE_BANDS)[number];

export const SEASON_START_MONTH = 8;
export const SEASON_START_DAY = 15;
export const CLUB_TIME_ZONE = "Asia/Taipei";

export type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isAgeBand(value: string): value is AgeBand {
  return (AGE_BANDS as readonly string[]).includes(value);
}

export function parseIsoDate(value: string): CalendarDate | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

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

export function formatIsoDate(date: CalendarDate): string {
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${date.year}-${month}-${day}`;
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function calendarDateInTimeZone(
  instant: Date,
  timeZone = CLUB_TIME_ZONE,
): CalendarDate {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const parsed = parseIsoDate(formatted);
  if (!parsed) {
    throw new Error(`Could not format calendar date for ${timeZone}`);
  }
  return parsed;
}

export function todayInClubTimeZone(instant = new Date()): CalendarDate {
  return calendarDateInTimeZone(instant, CLUB_TIME_ZONE);
}

function resolveAsOf(asOf?: string | CalendarDate | Date): CalendarDate | null {
  if (!asOf) {
    return todayInClubTimeZone();
  }
  if (asOf instanceof Date) {
    return calendarDateInTimeZone(asOf, CLUB_TIME_ZONE);
  }
  if (typeof asOf === "string") {
    return parseIsoDate(asOf);
  }
  return asOf;
}

export function getSeasonStart(asOf: CalendarDate): CalendarDate {
  const thisYearStart: CalendarDate = {
    year: asOf.year,
    month: SEASON_START_MONTH,
    day: SEASON_START_DAY,
  };
  if (compareDates(asOf, thisYearStart) >= 0) {
    return thisYearStart;
  }
  return {
    year: asOf.year - 1,
    month: SEASON_START_MONTH,
    day: SEASON_START_DAY,
  };
}

export function completedAgeYears(birth: CalendarDate, asOf: CalendarDate): number {
  let age = asOf.year - birth.year;
  if (
    asOf.month < birth.month ||
    (asOf.month === birth.month && asOf.day < birth.day)
  ) {
    age -= 1;
  }
  return age;
}

export function computedAgeBandFromAge(age: number): ComputedAgeBand {
  if (age < 6) return "U6";
  if (age < 8) return "U8";
  if (age < 10) return "U10";
  if (age < 12) return "U12";
  if (age < 15) return "U15";
  if (age < 18) return "U18";
  return "senior";
}

export function ageBandFromBirthDate(
  birthDate: string | CalendarDate,
  asOf?: string | CalendarDate | Date,
): ComputedAgeBand | null {
  const birth = typeof birthDate === "string" ? parseIsoDate(birthDate) : birthDate;
  if (!birth) {
    return null;
  }

  const asOfDate = resolveAsOf(asOf);
  if (!asOfDate) {
    return null;
  }

  const seasonStart = getSeasonStart(asOfDate);
  const age = completedAgeYears(birth, seasonStart);
  if (age < 0) {
    return "U6";
  }
  return computedAgeBandFromAge(age);
}

export function seasonStartForBirthDate(
  asOf?: string | CalendarDate | Date,
): CalendarDate | null {
  const asOfDate = resolveAsOf(asOf);
  if (!asOfDate) {
    return null;
  }
  return getSeasonStart(asOfDate);
}
