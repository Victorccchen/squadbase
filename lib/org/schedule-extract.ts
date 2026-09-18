/**
 * Stage L3: structured extraction of fixture rows from public HTML / visible text.
 * Product copy describes this as AI extraction. It must work offline so tests
 * and preview never require a live model. Torneopal HTML stays a fast path.
 */

import { parseImportDateTime } from "./import-parse.ts";
import {
  inferSeasonStartYear,
  parseTorneopalCalendarDate,
  parseTorneopalKickoffClock,
  parseTorneopalScheduleHtml,
  type ParsedTorneopalFixture,
  type ParsedTorneopalSchedule,
} from "./torneopal-parse.ts";
import { parseClubDateTimeLocal } from "./session-time.ts";

export type PublicScheduleParse = ParsedTorneopalSchedule & {
  loginWall: boolean;
  source: "torneopal" | "structured" | "empty";
};

function decodeMarkup(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

function decodeEntities(value: string): string {
  return decodeMarkup(value).replace(/\s+/g, " ").trim();
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "));
}

function titleTag(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1] ? stripTags(match[1]) : "";
}

export function htmlToVisibleText(html: string): string {
  const without = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li|table|thead|tbody|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeMarkup(without)
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function looksLikeLoginWall(html: string): boolean {
  const visible = htmlToVisibleText(html).toLowerCase();
  const hasPassword = /type\s*=\s*['"]password['"]/i.test(html);
  const loginWords = /sign[\s-]?in|log[\s-]?in|\blogin\b|登入|ログイン/.test(visible);
  const challenge =
    /cf-browser-verification|just a moment|attention required|captcha|cloudflare/i.test(html);
  return challenge || (hasPassword && loginWords);
}

type ColumnKind = "date" | "time" | "datetime" | "home" | "away" | "venue" | "match";

function classifyHeader(cell: string): ColumnKind | null {
  const t = cell.trim().toLowerCase();
  if (!t) {
    return null;
  }
  if (/(kickoff|kick-off|datetime|日期時間|開賽)/i.test(t) && /(date|time|日|時)/i.test(t)) {
    return "datetime";
  }
  if (/^(date|日期|日にち|日付|pvm|match date|kickoff date)$/i.test(t) || /(^| )date$/.test(t)) {
    return "date";
  }
  if (/^(time|時間|時刻|klo|kickoff|kick-off)$/i.test(t)) {
    return "time";
  }
  if (/^(home|home team|主|主隊|主场|主場|ホーム)$/i.test(t)) {
    return "home";
  }
  if (/^(away|away team|客|客隊|客场|客場|アウェイ)$/i.test(t)) {
    return "away";
  }
  if (/^(venue|location|ground|場地|球場|場所|kentt)/i.test(t)) {
    return "venue";
  }
  if (/^(match|fixture|game|比賽|対戦|vs)$/i.test(t)) {
    return "match";
  }
  return null;
}

function cellTexts(rowHtml: string): string[] {
  const cells: string[] = [];
  const re = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rowHtml))) {
    cells.push(stripTags(match[1] ?? ""));
  }
  return cells;
}

function tableRowHtmls(tableHtml: string): string[] {
  const rows: string[] = [];
  const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tableHtml))) {
    rows.push(match[1] ?? "");
  }
  return rows;
}

function splitHomeAway(text: string): { home: string; away: string } | null {
  const parts = text.split(/\s+(?:vs\.?|v\.|versus|對|対)\s+/i);
  if (parts.length < 2) {
    return null;
  }
  const home = parts[0]!.trim();
  const away = parts.slice(1).join(" vs ").trim();
  if (!home || !away) {
    return null;
  }
  return { home, away };
}

function isoDateFromText(text: string, seasonStartYear: number | null): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-" || trimmed === "–") {
    return null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3]);
    if (day > 12) {
      return parseClubDateTimeLocal(
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00`,
      )?.slice(0, 10) ?? null;
    }
  }
  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(trimmed);
  if (ymd) {
    return parseClubDateTimeLocal(
      `${ymd[1]}-${String(Number(ymd[2])).padStart(2, "0")}-${String(Number(ymd[3])).padStart(2, "0")}T00:00`,
    )?.slice(0, 10) ?? null;
  }
  return parseTorneopalCalendarDate(trimmed, seasonStartYear);
}

function clockFromText(text: string): string {
  const trimmed = text.trim();
  const hm = /(\d{1,2})[:.](\d{2})/.exec(trimmed);
  if (!hm) {
    return "";
  }
  return `${hm[1]}:${hm[2]}`;
}

function parseKickoffStamp(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
  }
  return parseImportDateTime(trimmed);
}

function combineKickoff(dateIso: string | null, timeText: string): string | null {
  if (!dateIso) {
    return parseKickoffStamp(timeText);
  }
  const clock = parseTorneopalKickoffClock(clockFromText(timeText) || timeText);
  if (!clock) {
    return parseKickoffStamp(timeText);
  }
  return parseClubDateTimeLocal(
    `${dateIso}T${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`,
  );
}

function jsonText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string") {
      return record.name.trim();
    }
    if (typeof record["@value"] === "string") {
      return record["@value"].trim();
    }
  }
  return "";
}

function collectEvents(value: unknown, out: Record<string, unknown>[]): void {
  if (!value) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectEvents(item, out);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  const types = Array.isArray(type) ? type.map(String) : type ? [String(type)] : [];
  if (types.some((item) => /sportsevent|event/i.test(item))) {
    out.push(record);
  }
  if (record["@graph"]) {
    collectEvents(record["@graph"], out);
  }
}

function parseJsonLdEvents(html: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    try {
      collectEvents(JSON.parse(raw) as unknown, events);
    } catch {
      // Best-effort only.
    }
  }
  return events;
}

function fixtureKey(row: ParsedTorneopalFixture): string {
  return `${row.home}|${row.away}|${row.startsAt ?? ""}|${row.dateText}|${row.timeText}`;
}

function pushFixture(
  fixtures: ParsedTorneopalFixture[],
  seen: Set<string>,
  row: Omit<ParsedTorneopalFixture, "sourceIndex">,
): void {
  const home = row.home.trim();
  const away = row.away.trim();
  if (!home || !away || home.toLowerCase() === away.toLowerCase()) {
    return;
  }
  const fixture: ParsedTorneopalFixture = {
    ...row,
    home,
    away,
    sourceIndex: fixtures.length + 1,
  };
  const key = fixtureKey(fixture);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  fixtures.push(fixture);
}

function extractFromTables(
  html: string,
  seasonStartYear: number | null,
  fixtures: ParsedTorneopalFixture[],
  seen: Set<string>,
): void {
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let table: RegExpExecArray | null;
  while ((table = tableRe.exec(html))) {
    const rows = tableRowHtmls(table[1] ?? "");
    if (rows.length < 2) {
      continue;
    }
    let headerIndex = -1;
    let columns: Array<ColumnKind | null> = [];
    for (let i = 0; i < Math.min(rows.length, 3); i += 1) {
      const cells = cellTexts(rows[i]!);
      const mapped = cells.map(classifyHeader);
      const useful = mapped.filter(Boolean);
      if (useful.length >= 2) {
        headerIndex = i;
        columns = mapped;
        break;
      }
    }
    if (headerIndex < 0) {
      continue;
    }
    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const cells = cellTexts(rows[i]!);
      if (cells.every((cell) => !cell)) {
        continue;
      }
      let dateText = "";
      let timeText = "";
      let home = "";
      let away = "";
      let venue = "";
      for (let c = 0; c < columns.length; c += 1) {
        const kind = columns[c];
        const value = cells[c] ?? "";
        switch (kind) {
          case "date":
            dateText = value;
            break;
          case "time":
            timeText = value;
            break;
          case "datetime": {
            const stamp = parseKickoffStamp(value);
            if (stamp) {
              dateText = stamp.slice(0, 10);
              timeText = stamp.slice(11, 16);
            } else {
              const parts = value.split(/\s+/);
              dateText = parts[0] ?? "";
              timeText = parts[1] ?? "";
            }
            break;
          }
          case "home":
            home = value;
            break;
          case "away":
            away = value;
            break;
          case "venue":
            venue = value;
            break;
          case "match": {
            const sides = splitHomeAway(value);
            if (sides) {
              home = sides.home;
              away = sides.away;
            }
            break;
          }
          case null:
          case undefined:
            break;
          default: {
            const exhaustive: never = kind;
            void exhaustive;
            break;
          }
        }
      }
      if (!home || !away) {
        continue;
      }
      const dateIso = isoDateFromText(dateText, seasonStartYear);
      pushFixture(fixtures, seen, {
        dateText,
        timeText: clockFromText(timeText),
        category: "",
        venue,
        home,
        away,
        matchNo: "",
        startsAt: combineKickoff(dateIso, timeText),
      });
    }
  }
}

function extractFromJsonLd(
  html: string,
  fixtures: ParsedTorneopalFixture[],
  seen: Set<string>,
): void {
  for (const event of parseJsonLdEvents(html)) {
    const home = jsonText(event.homeTeam);
    const away = jsonText(event.awayTeam);
    let resolvedHome = home;
    let resolvedAway = away;
    if (!resolvedHome || !resolvedAway) {
      const competitors = event.competitor;
      const names = Array.isArray(competitors)
        ? competitors.map(jsonText).filter(Boolean)
        : [];
      if (names.length >= 2) {
        resolvedHome = names[0]!;
        resolvedAway = names[1]!;
      }
    }
    if (!resolvedHome || !resolvedAway) {
      const sides = splitHomeAway(jsonText(event.name));
      if (sides) {
        resolvedHome = sides.home;
        resolvedAway = sides.away;
      }
    }
    const startRaw =
      jsonText(event.startDate) || jsonText(event.startDateTime) || jsonText(event.startTime);
    const startsAt = parseKickoffStamp(startRaw);
    const dateText = startsAt ? startsAt.slice(0, 10) : startRaw;
    const timeText = startsAt ? startsAt.slice(11, 16) : clockFromText(startRaw);
    pushFixture(fixtures, seen, {
      dateText,
      timeText,
      category: jsonText(event.name),
      venue: jsonText(event.location),
      home: resolvedHome,
      away: resolvedAway,
      matchNo: "",
      startsAt,
    });
  }
}

const VS_LINE_RE =
  /^(?:(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})\s+)?(.{2,80}?)\s+(?:vs\.?|v\.|versus|對|対)\s+(.{2,80}?)(?:\s+@\s+(.{2,80}))?$/i;

function extractFromVisibleText(
  html: string,
  seasonStartYear: number | null,
  fixtures: ParsedTorneopalFixture[],
  seen: Set<string>,
): void {
  const lines = htmlToVisibleText(html).split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length > 400) {
      continue;
    }
    const match = VS_LINE_RE.exec(line.replace(/\s+@\s+/i, " @ "));
    if (!match) {
      continue;
    }
    const dateText = match[1] ?? "";
    const timeText = match[2] ?? "";
    const home = (match[3] ?? "").replace(/^[·\-–|]\s*/, "").trim();
    const awayVenue = (match[4] ?? "").trim();
    const venueFromAt = (match[5] ?? "").trim();
    const awayParts = awayVenue.split(/\s+@\s+/);
    const away = (awayParts[0] ?? "").trim();
    const venue = venueFromAt || (awayParts[1] ?? "").trim();
    if (!dateText && !timeText) {
      continue;
    }
    const dateIso = isoDateFromText(dateText, seasonStartYear);
    pushFixture(fixtures, seen, {
      dateText,
      timeText,
      category: "",
      venue,
      home,
      away,
      matchNo: "",
      startsAt: combineKickoff(dateIso, timeText),
    });
  }
}

export function extractScheduleStructured(html: string): ParsedTorneopalSchedule {
  const pageTitle = titleTag(html);
  const seasonStartYear = inferSeasonStartYear(pageTitle) ?? inferSeasonStartYear(html);
  const fixtures: ParsedTorneopalFixture[] = [];
  const seen = new Set<string>();
  extractFromTables(html, seasonStartYear, fixtures, seen);
  extractFromJsonLd(html, fixtures, seen);
  extractFromVisibleText(html, seasonStartYear, fixtures, seen);
  return { pageTitle, seasonStartYear, fixtures };
}

export function parsePublicScheduleHtml(html: string): PublicScheduleParse {
  const loginWall = looksLikeLoginWall(html);
  const torneopal = parseTorneopalScheduleHtml(html);
  if (torneopal.fixtures.length > 0) {
    return { ...torneopal, loginWall, source: "torneopal" };
  }
  const structured = extractScheduleStructured(html);
  if (structured.fixtures.length > 0) {
    return { ...structured, loginWall, source: "structured" };
  }
  return {
    pageTitle: structured.pageTitle || torneopal.pageTitle,
    seasonStartYear: structured.seasonStartYear ?? torneopal.seasonStartYear,
    fixtures: [],
    loginWall,
    source: "empty",
  };
}
