/**
 * Best-effort match field extraction from public HTML. Never persist the HTML.
 */

import { parseMatchKind, parseMatchSide, type MatchKind, type MatchSide } from "./match.ts";
import { parseImportDateTime } from "./import-parse.ts";
import { MAX_SESSION_LOCATION, MAX_SESSION_NOTES, MAX_SESSION_TITLE } from "./session-time.ts";
import { parseOptionalBoundedText, parseRequiredBoundedText } from "./parse.ts";

export type MatchUrlSuggestions = {
  title: string | null;
  kind: MatchKind | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  opponent: string | null;
  side: MatchSide | null;
  notes: string | null;
};

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .trim();
}

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const property = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    );
    const propertyFlip = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,
      "i",
    );
    const match = property.exec(html) ?? propertyFlip.exec(html);
    if (match?.[1]) {
      return decodeEntities(match[1]);
    }
  }
  return null;
}

function titleTag(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match?.[1]) {
    return null;
  }
  return decodeEntities(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function timeDatetimes(html: string): string[] {
  const out: string[] = [];
  const re = /<time[^>]+datetime=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match[1]) {
      out.push(decodeEntities(match[1]));
    }
  }
  return out;
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
      const parsed = JSON.parse(raw) as unknown;
      collectEvents(parsed, events);
    } catch {
      // Best-effort only.
    }
  }
  return events;
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
  if (types.some((item) => /event/i.test(item))) {
    out.push(record);
  }
  if (record["@graph"]) {
    collectEvents(record["@graph"], out);
  }
}

function textFromJson(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
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
  return null;
}

function guessKind(text: string): MatchKind | null {
  const blob = text.toLowerCase();
  if (blob.includes("friendly") || blob.includes("友誼") || blob.includes("亲善") || blob.includes("親善")) {
    return "friendly";
  }
  if (blob.includes("league") || blob.includes("聯賽") || blob.includes("联赛") || blob.includes("リーグ")) {
    return "league";
  }
  if (blob.includes("cup") || blob.includes("盃") || blob.includes("杯") || blob.includes("カップ")) {
    return "cup";
  }
  return parseMatchKind(blob);
}

function guessOpponent(title: string): string | null {
  const vs = title.split(/\s+(?:vs\.?|v\.|versus|對|対)\s+/i);
  if (vs.length >= 2) {
    const right = vs[vs.length - 1]!.trim();
    return right.length > 0 ? right.slice(0, 200) : null;
  }
  return null;
}

function guessSide(text: string): MatchSide | null {
  const blob = text.toLowerCase();
  if (blob.includes("away") || blob.includes("客場") || blob.includes("アウェイ")) {
    return "away";
  }
  if (blob.includes("home") || blob.includes("主場") || blob.includes("ホーム")) {
    return "home";
  }
  return parseMatchSide(blob);
}

export function extractMatchFieldsFromHtml(html: string): MatchUrlSuggestions {
  const events = parseJsonLdEvents(html);
  const event = events[0] ?? {};
  const jsonTitle = textFromJson(event.name);
  const jsonStart = textFromJson(event.startDate) ?? textFromJson(event.startDateTime);
  const jsonEnd = textFromJson(event.endDate) ?? textFromJson(event.endDateTime);
  const jsonLocation = textFromJson(event.location);
  const jsonOpponent =
    textFromJson(event.opponent) ??
    textFromJson(event.awayTeam) ??
    textFromJson(event.homeTeam);

  const ogTitle = metaContent(html, ["og:title", "twitter:title"]);
  const pageTitle = titleTag(html);
  const titleSource = jsonTitle ?? ogTitle ?? pageTitle;
  const title = titleSource ? parseRequiredBoundedText(titleSource, MAX_SESSION_TITLE) : null;

  const times = timeDatetimes(html);
  const startsAt =
    parseImportDateTime(jsonStart ?? "") ??
    parseImportDateTime(times[0] ?? "") ??
    parseImportDateTime(metaContent(html, ["event:start_time", "og:start_time"]) ?? "");
  const endsAt =
    parseImportDateTime(jsonEnd ?? "") ??
    parseImportDateTime(times[1] ?? "") ??
    null;

  const location =
    parseOptionalBoundedText(jsonLocation ?? "", MAX_SESSION_LOCATION) ??
    parseOptionalBoundedText(metaContent(html, ["og:location", "geo.placename"]) ?? "", MAX_SESSION_LOCATION);

  const description = metaContent(html, ["og:description", "description"]);
  const kindBlob = [title ?? "", description ?? "", jsonTitle ?? ""].join(" ");
  const kind = guessKind(kindBlob);
  const opponent =
    parseOptionalBoundedText(jsonOpponent ?? "", 200) ??
    (title ? guessOpponent(title) : null);
  const side = guessSide(kindBlob);
  const notes = parseOptionalBoundedText(description ?? "", MAX_SESSION_NOTES);

  return {
    title,
    kind,
    startsAt,
    endsAt,
    location,
    opponent,
    side,
    notes,
  };
}
