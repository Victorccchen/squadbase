/**
 * Stage L: parse Torneopal schedule / team HTML. Never throws. No network.
 *
 * Schedule pages: date headers `<li class="title">Sun 20.9.2026</li>` then
 * `<li class="match">` rows. Team pages: per-row `<div class="ml_pvm">4.10.</div>`
 * without a year (infer from "26/27" in the page title).
 */

import { parseClubDateTimeLocal } from "./session-time.ts";

export type ParsedTorneopalFixture = {
  sourceIndex: number;
  dateText: string;
  timeText: string;
  category: string;
  venue: string;
  home: string;
  away: string;
  matchNo: string;
  startsAt: string | null;
};

export type ParsedTorneopalSchedule = {
  pageTitle: string;
  seasonStartYear: number | null;
  fixtures: ParsedTorneopalFixture[];
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "));
}

function titleTag(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1] ? stripTags(match[1]) : "";
}

function divByClass(block: string, className: string): string {
  const re = new RegExp(`<div\\s+class=['"]${className}\\s*['"][^>]*>([\\s\\S]*?)</div>`, "i");
  const match = re.exec(block);
  return match?.[1] ? stripTags(match[1]) : "";
}

export function inferSeasonStartYear(text: string): number | null {
  const yy = /\b(\d{2})\/(\d{2})\b/.exec(text);
  if (yy) {
    const start = Number(yy[1]);
    if (start >= 20 && start <= 40) {
      return 2000 + start;
    }
  }
  const yyyy = /\b(20\d{2})\s*[/\-–]\s*(20\d{2}|\d{2})\b/.exec(text);
  if (yyyy?.[1]) {
    return Number(yyyy[1]);
  }
  return null;
}

function isoDate(year: number, month: number, day: number): string | null {
  const stamp = parseClubDateTimeLocal(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00`,
  );
  return stamp ? stamp.slice(0, 10) : null;
}

export function parseTorneopalCalendarDate(
  text: string,
  seasonStartYear: number | null,
): string | null {
  const cleaned = decodeEntities(text);
  const full =
    /(?:(?:mon|tue|wed|thu|fri|sat|sun)\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4})\b/i.exec(cleaned);
  if (full) {
    return isoDate(Number(full[3]), Number(full[2]), Number(full[1]));
  }
  const short = /(?:(?:mon|tue|wed|thu|fri|sat|sun)\s+)?(\d{1,2})\.(\d{1,2})\.?\s*$/i.exec(
    cleaned,
  );
  if (short && seasonStartYear != null) {
    const day = Number(short[1]);
    const month = Number(short[2]);
    const year = month >= 8 ? seasonStartYear : seasonStartYear + 1;
    return isoDate(year, month, day);
  }
  return null;
}

export function parseTorneopalKickoffClock(text: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function combineKickoff(dateIso: string | null, timeText: string): string | null {
  if (!dateIso) {
    return null;
  }
  const clock = parseTorneopalKickoffClock(timeText);
  if (!clock) {
    return null;
  }
  return parseClubDateTimeLocal(
    `${dateIso}T${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`,
  );
}

function classTokens(attrs: string): string[] {
  const match = /\bclass\s*=\s*['"]([^'"]*)['"]/i.exec(attrs);
  if (!match?.[1]) {
    return [];
  }
  return match[1].split(/\s+/).filter(Boolean);
}

const LI_RE = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;

export function parseTorneopalScheduleHtml(html: string): ParsedTorneopalSchedule {
  const pageTitle = titleTag(html);
  const seasonStartYear = inferSeasonStartYear(pageTitle) ?? inferSeasonStartYear(html);
  const fixtures: ParsedTorneopalFixture[] = [];
  let currentDateText = "";
  let currentDateIso: string | null = null;
  let sourceIndex = 0;

  const tokenRe = new RegExp(LI_RE.source, "gi");
  let token: RegExpExecArray | null;
  while ((token = tokenRe.exec(html))) {
    const attrs = token[1] ?? "";
    const inner = token[2] ?? "";
    const classes = classTokens(attrs);
    if (classes.includes("title")) {
      currentDateText = stripTags(inner);
      currentDateIso = parseTorneopalCalendarDate(currentDateText, seasonStartYear);
      continue;
    }
    if (!classes.includes("match")) {
      continue;
    }
    sourceIndex += 1;
    const pvm = divByClass(inner, "ml_pvm");
    const dateText = pvm || currentDateText;
    const dateIso = pvm
      ? parseTorneopalCalendarDate(pvm, seasonStartYear) ?? currentDateIso
      : currentDateIso;
    const timeText = divByClass(inner, "ml_tulosklo");
    const category = divByClass(inner, "ml_sarja") || divByClass(inner, "ml_sarjanimi");
    const venue = divByClass(inner, "ml_kenttanimi");
    const home = divByClass(inner, "ml_kotisiisti");
    const away = divByClass(inner, "ml_vierassiisti");
    const matchNo = divByClass(inner, "ml_ottelunro");
    fixtures.push({
      sourceIndex,
      dateText,
      timeText,
      category,
      venue,
      home,
      away,
      matchNo,
      startsAt: combineKickoff(dateIso, timeText),
    });
  }

  return { pageTitle, seasonStartYear, fixtures };
}
