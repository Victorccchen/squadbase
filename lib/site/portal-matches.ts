import { partitionPublicMatches } from "../org/match.ts";

/** Homepage shows a short strip, not the full public list. */
export const PORTAL_MATCH_LIMIT = 3;

export type PortalResultMark = "W" | "D" | "L";

/**
 * Split published matches the same way as the public matches page
 * (kickoff >= now is upcoming; older than 90 days is omitted), then
 * keep the soonest upcoming and the most recent past, up to `limit`.
 */
export function selectPortalMatches<T extends { starts_at: string }>(
  matches: readonly T[],
  nowMs: number,
  limit = PORTAL_MATCH_LIMIT,
): { upcoming: T[]; recent: T[] } {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  const { upcoming, recentPast } = partitionPublicMatches(matches.slice(), nowMs);
  return {
    upcoming: upcoming.slice(0, safeLimit),
    recent: recentPast.slice(0, safeLimit),
  };
}

/** Null when either score is missing — never invent a result. */
export function portalResultMark(
  clubScore: number | null,
  opponentScore: number | null,
): PortalResultMark | null {
  if (clubScore === null || opponentScore === null) {
    return null;
  }
  if (clubScore > opponentScore) {
    return "W";
  }
  if (clubScore < opponentScore) {
    return "L";
  }
  return "D";
}

export type PortalKickoffParts = {
  day: string;
  month: string;
  weekday: string;
  time: string;
  full: string;
};

export function formatPortalKickoff(
  iso: string,
  locale: string,
  timeZone: string,
): PortalKickoffParts | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  const tag = locale === "zh-Hant" ? "zh-TW" : locale;
  return {
    day: new Intl.DateTimeFormat("en", { day: "numeric", timeZone }).format(instant),
    month: new Intl.DateTimeFormat(tag, { month: "short", timeZone }).format(instant),
    weekday: new Intl.DateTimeFormat(tag, { weekday: "short", timeZone }).format(instant),
    time: new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(instant),
    full: new Intl.DateTimeFormat(tag, {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      timeZone,
    }).format(instant),
  };
}

export function formatPortalDate(isoDate: string, locale: string, timeZone: string): string {
  const instant = new Date(`${isoDate}T12:00:00+08:00`);
  if (Number.isNaN(instant.getTime())) {
    return isoDate;
  }
  const tag = locale === "zh-Hant" ? "zh-TW" : locale;
  return new Intl.DateTimeFormat(tag, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(instant);
}
