/**
 * Calendar add helpers for public match and parent session/match surfaces.
 * Payloads only include title, start/end, location, and a short description
 * (opponent or TBD, kind). Never phones, assessments, credits, or guardian data.
 */

import { publicOpponentLabel, isMatchKind } from "./match.ts";
import type { SessionKind } from "../supabase/database.types.ts";

export const CALENDAR_PAYLOAD_KEYS = [
  "uid",
  "title",
  "startsAt",
  "endsAt",
  "location",
  "description",
] as const;

export type CalendarEventPayload = {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  description: string;
};

export const FORBIDDEN_CALENDAR_SUBSTRINGS = [
  "phone",
  "credits",
  "last5",
  "guardian",
  "assessment",
  "parent_note",
  "debit",
] as const;

export function toUtcBasic(iso: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n");
}

function foldIcsLine(line: string): string {
  if (line.length <= 74) {
    return line;
  }
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 74));
  remaining = remaining.slice(74);
  while (remaining.length > 0) {
    chunks.push(` ${remaining.slice(0, 73)}`);
    remaining = remaining.slice(73);
  }
  return chunks.join("\r\n");
}

export function calendarDescription(input: {
  kindLabel: string;
  opponent?: string | null;
  opponentTbd: string;
  includeOpponent?: boolean;
}): string {
  const kind = input.kindLabel.trim();
  if (input.includeOpponent === false) {
    return kind;
  }
  const opponent = publicOpponentLabel(input.opponent, input.opponentTbd);
  if (!kind) {
    return opponent;
  }
  return `${kind}. ${opponent}`;
}

export function calendarEventFromPublicFields(
  input: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    location?: string | null;
    kind: SessionKind;
    opponent?: string | null;
  },
  labels: { kindLabel: string; opponentTbd: string },
): CalendarEventPayload {
  const isMatch = isMatchKind(input.kind);
  return {
    uid: `session-${input.id}@squadbase`,
    title: input.title,
    startsAt: input.starts_at,
    endsAt: input.ends_at,
    location: input.location?.trim() ? input.location.trim() : null,
    description: calendarDescription({
      kindLabel: labels.kindLabel,
      opponent: input.opponent,
      opponentTbd: labels.opponentTbd,
      includeOpponent: isMatch,
    }),
  };
}

export function buildIcs(event: CalendarEventPayload, now = new Date()): string {
  const dtStart = toUtcBasic(event.startsAt);
  const dtEnd = toUtcBasic(event.endsAt);
  const dtStamp = toUtcBasic(now.toISOString());
  if (!dtStart || !dtEnd || !dtStamp) {
    return "";
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Club//squadbase//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : null,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line !== null);

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function googleCalendarUrl(event: CalendarEventPayload): string {
  const start = toUtcBasic(event.startsAt);
  const end = toUtcBasic(event.endsAt);
  if (!start || !end) {
    return "";
  }
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    details: event.description,
  });
  if (event.location) {
    params.set("location", event.location);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(event: CalendarEventPayload): string {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "";
  }
  const params = new URLSearchParams({
    rru: "addevent",
    path: "/calendar/action/compose",
    subject: event.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: event.description,
  });
  if (event.location) {
    params.set("location", event.location);
  }
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function icsFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${slug || "event"}.ics`;
}

export function calendarTextHasForbiddenPrivateFields(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_CALENDAR_SUBSTRINGS.some((token) => lower.includes(token));
}
