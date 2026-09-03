/**
 * Club-local (Asia/Taipei) date-time helpers for training sessions.
 * Taiwan does not observe DST, so wall time maps to offset +08:00.
 */

export const CLUB_TIME_ZONE = "Asia/Taipei";
export const CLUB_UTC_OFFSET = "+08:00";

export const DATETIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export const MAX_SESSION_LOCATION = 200;
export const MAX_SESSION_NOTES = 1000;
export const MAX_SESSION_MESSAGE = 2000;
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 480;

export type ClubDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidClubDateTime(parts: ClubDateTimeParts): boolean {
  if (
    !Number.isInteger(parts.year) ||
    !Number.isInteger(parts.month) ||
    !Number.isInteger(parts.day) ||
    !Number.isInteger(parts.hour) ||
    !Number.isInteger(parts.minute) ||
    !Number.isInteger(parts.second)
  ) {
    return false;
  }
  if (parts.month < 1 || parts.month > 12) {
    return false;
  }
  if (parts.day < 1 || parts.day > 31) {
    return false;
  }
  if (parts.hour < 0 || parts.hour > 23) {
    return false;
  }
  if (parts.minute < 0 || parts.minute > 59) {
    return false;
  }
  if (parts.second < 0 || parts.second > 59) {
    return false;
  }

  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    utc.getUTCFullYear() === parts.year &&
    utc.getUTCMonth() === parts.month - 1 &&
    utc.getUTCDate() === parts.day
  );
}

export function parseDateTimeLocal(
  value: string,
): ClubDateTimeParts | null {
  const match = DATETIME_LOCAL_RE.exec(value.trim());
  if (!match) {
    return null;
  }

  const parts: ClubDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
  };

  if (!isValidClubDateTime(parts)) {
    return null;
  }
  return parts;
}

export function clubDateTimeToOffsetIso(parts: ClubDateTimeParts): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}${CLUB_UTC_OFFSET}`;
}

/**
 * Parse an `<input type="datetime-local">` value as Asia/Taipei wall time.
 * Returns an ISO-8601 string with offset +08:00, or null if invalid.
 */
export function parseClubDateTimeLocal(value: string): string | null {
  const parts = parseDateTimeLocal(value);
  if (!parts) {
    return null;
  }
  return clubDateTimeToOffsetIso(parts);
}

export function addMinutesToOffsetIso(iso: string, minutes: number): string | null {
  if (!Number.isInteger(minutes)) {
    return null;
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms + minutes * 60_000).toISOString();
}

export function parseDurationMinutes(value: string): number | null {
  if (!/^\d{1,3}$/.test(value.trim())) {
    return null;
  }
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n < MIN_DURATION_MINUTES || n > MAX_DURATION_MINUTES) {
    return null;
  }
  return n;
}

export function isEndsAfterStart(startsAt: string, endsAt: string): boolean {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }
  return end > start;
}

export function isSessionOpenForSignup(
  session: { status: string; ends_at: string },
  now = new Date(),
): boolean {
  return session.status === "active" && Date.parse(session.ends_at) > now.getTime();
}

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

/** Format a timestamptz as `YYYY-MM-DDTHH:mm` in Asia/Taipei for datetime-local inputs. */
export function toDateTimeLocalInput(
  iso: string,
  timeZone = CLUB_TIME_ZONE,
): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const year = partValue(parts, "year");
  const month = partValue(parts, "month");
  const day = partValue(parts, "day");
  let hour = partValue(parts, "hour");
  const minute = partValue(parts, "minute");
  if (hour === "24") {
    hour = "00";
  }
  if (!year || !month || !day || !hour || !minute) {
    return "";
  }
  return `${year}-${month}-${day}T${hour.padStart(2, "0")}:${minute}`;
}

export function formatClubDateTime(
  iso: string,
  locale: string,
  timeZone = CLUB_TIME_ZONE,
): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return iso;
  }
  const intlLocale =
    locale === "zh-Hant" ? "zh-TW" : locale === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(intlLocale, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

export function formatClubDateTimeRange(
  startsAt: string,
  endsAt: string,
  locale: string,
): string {
  return `${formatClubDateTime(startsAt, locale)} – ${formatClubDateTime(endsAt, locale)}`;
}
