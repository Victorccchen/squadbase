/**
 * Stage L: map parsed Torneopal fixtures onto existing 隊伍 and skip duplicates.
 * Create-only. Never updates an existing match.
 */

import {
  canonicalClubTeamName,
  looksLikeClubTeamName,
  opponentDuplicateKey,
} from "./torneopal-aliases.ts";
import type { ParsedTorneopalFixture, ParsedTorneopalSchedule } from "./torneopal-parse.ts";
import type { MatchImportDraft } from "./import-parse.ts";
import type { OrgErrorKey } from "./errors.ts";
import type { ImportTeam } from "./import-validate.ts";
import { isCompetitionTeam } from "./squad-team.ts";
import {
  DEFAULT_MATCH_DURATION_MINUTES,
  parseMatchOpponent,
  type MatchSide,
} from "./match.ts";
import { parseOptionalBoundedText, parseRequiredBoundedText } from "./parse.ts";
import {
  addMinutesToOffsetIso,
  isEndsAfterStart,
  MAX_SESSION_LOCATION,
  MAX_SESSION_TITLE,
  toDateTimeLocalInput,
} from "./session-time.ts";

export const MAX_TORNEOPAL_ROWS = 200;

export type ExistingMatchShell = {
  teamId: string;
  startsAt: string;
  opponent: string | null;
};

export type TorneopalPreviewStatus = "create" | "skip" | "error";

export type TorneopalPreviewRow = {
  line: number;
  status: TorneopalPreviewStatus;
  errorKeys: OrgErrorKey[];
  summary: string;
  draft: MatchImportDraft | null;
};

export type TorneopalPreview = {
  sourceUrl: string;
  pageTitle: string;
  rows: TorneopalPreviewRow[];
  createCount: number;
  skipCount: number;
  errorCount: number;
};

export type TorneopalPreviewResult =
  | ({ ok: true } & TorneopalPreview)
  | { ok: false; errorKey: OrgErrorKey };

function uniqueKeys(keys: OrgErrorKey[]): OrgErrorKey[] {
  return [...new Set(keys)];
}

export function startMinuteKey(iso: string): string {
  const local = toDateTimeLocalInput(iso);
  return local || iso.trim();
}

export function matchDuplicateKey(input: {
  teamId: string;
  startsAt: string;
  opponent: string | null;
}): string {
  return `${input.teamId}|${startMinuteKey(input.startsAt)}|${opponentDuplicateKey(input.opponent)}`;
}

function findCompetitionTeam(
  catalog: ImportTeam[],
  name: string,
): ImportTeam | null {
  const exact = catalog.filter(
    (team) => isCompetitionTeam(team) && team.name === name,
  );
  if (exact.length === 1) {
    return exact[0]!;
  }
  const folded = name.trim().toLowerCase();
  const ci = catalog.filter(
    (team) => isCompetitionTeam(team) && team.name.trim().toLowerCase() === folded,
  );
  if (ci.length === 1) {
    return ci[0]!;
  }
  return null;
}

export type ClubSideResolution =
  | { kind: "mapped"; team: ImportTeam; canonicalName: string }
  | { kind: "foreign" }
  | { kind: "unmapped" };

export function resolveClubSide(raw: string, catalog: ImportTeam[]): ClubSideResolution {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { kind: "foreign" };
  }
  const canonical = canonicalClubTeamName(trimmed);
  if (canonical) {
    const team = findCompetitionTeam(catalog, canonical);
    return team ? { kind: "mapped", team, canonicalName: canonical } : { kind: "unmapped" };
  }
  const exact = findCompetitionTeam(catalog, trimmed);
  if (exact) {
    return { kind: "mapped", team: exact, canonicalName: exact.name };
  }
  if (looksLikeClubTeamName(trimmed)) {
    return { kind: "unmapped" };
  }
  return { kind: "foreign" };
}

function leagueTitle(pageTitle: string, fixture: ParsedTorneopalFixture, opponent: string | null): string {
  const parts = [pageTitle, fixture.category].map((part) => part.trim()).filter(Boolean);
  const head = parts.join(" ") || "聯賽";
  const vs = opponent?.trim() ? ` vs ${opponent.trim()}` : "";
  return `${head}${vs}`;
}

function buildDraft(input: {
  team: ImportTeam;
  title: string;
  startsAt: string;
  location: string | null;
  opponent: string | null;
  side: MatchSide;
}): { ok: true; draft: MatchImportDraft } | { ok: false; errorKeys: OrgErrorKey[] } {
  const errorKeys: OrgErrorKey[] = [];
  const title = parseRequiredBoundedText(input.title, MAX_SESSION_TITLE);
  if (!title) {
    errorKeys.push("missingTitle");
  }
  const endsAt = addMinutesToOffsetIso(input.startsAt, DEFAULT_MATCH_DURATION_MINUTES);
  if (!endsAt || !isEndsAfterStart(input.startsAt, endsAt)) {
    errorKeys.push("invalidSessionTime");
  }
  const opponentParsed = parseMatchOpponent(input.opponent ?? "");
  if (!opponentParsed.ok) {
    errorKeys.push("invalidOpponent");
  }
  if (errorKeys.length > 0 || !title || !endsAt) {
    return { ok: false, errorKeys: uniqueKeys(errorKeys) };
  }
  return {
    ok: true,
    draft: {
      teamRef: input.team.id,
      title,
      kind: "league",
      startsAt: input.startsAt,
      endsAt,
      location: parseOptionalBoundedText(input.location ?? "", MAX_SESSION_LOCATION),
      opponent: opponentParsed.ok ? opponentParsed.opponent : null,
      side: input.side,
      isPlayoff: false,
      isPublished: false,
      notes: null,
    },
  };
}

function summaryFor(draft: MatchImportDraft, teamName: string): string {
  return `${teamName} · ${draft.startsAt} · ${draft.side} · vs ${draft.opponent ?? "TBD"} · published=false`;
}

type SeenKeys = Set<string>;

function pushRow(
  rows: TorneopalPreviewRow[],
  seen: SeenKeys,
  existing: SeenKeys,
  input: {
    line: number;
    team: ImportTeam;
    title: string;
    startsAt: string | null;
    location: string;
    opponent: string;
    side: MatchSide;
    extraErrors: OrgErrorKey[];
  },
): void {
  const errorKeys = [...input.extraErrors];
  if (!input.startsAt) {
    errorKeys.push("invalidSessionTime");
  }
  if (errorKeys.length > 0 || !input.startsAt) {
    rows.push({
      line: input.line,
      status: "error",
      errorKeys: uniqueKeys(errorKeys),
      summary: `${input.team.name} · ${input.side} · vs ${input.opponent || "TBD"}`,
      draft: null,
    });
    return;
  }
  const built = buildDraft({
    team: input.team,
    title: input.title,
    startsAt: input.startsAt,
    location: input.location,
    opponent: input.opponent,
    side: input.side,
  });
  if (!built.ok) {
    rows.push({
      line: input.line,
      status: "error",
      errorKeys: built.errorKeys,
      summary: `${input.team.name} · ${input.side} · vs ${input.opponent || "TBD"}`,
      draft: null,
    });
    return;
  }
  const key = matchDuplicateKey({
    teamId: input.team.id,
    startsAt: built.draft.startsAt,
    opponent: built.draft.opponent,
  });
  if (existing.has(key) || seen.has(key)) {
    rows.push({
      line: input.line,
      status: "skip",
      errorKeys: ["duplicateMatch"],
      summary: summaryFor(built.draft, input.team.name),
      draft: built.draft,
    });
    return;
  }
  seen.add(key);
  rows.push({
    line: input.line,
    status: "create",
    errorKeys: [],
    summary: summaryFor(built.draft, input.team.name),
    draft: built.draft,
  });
}

export function buildTorneopalPreview(input: {
  sourceUrl: string;
  parsed: ParsedTorneopalSchedule;
  teams: ImportTeam[];
  existing: ExistingMatchShell[];
}): TorneopalPreviewResult {
  if (input.parsed.fixtures.length === 0) {
    return { ok: false, errorKey: "torneopalNoFixtures" };
  }

  const existingKeys: SeenKeys = new Set(
    input.existing.map((row) =>
      matchDuplicateKey({
        teamId: row.teamId,
        startsAt: row.startsAt,
        opponent: row.opponent,
      }),
    ),
  );
  const seen: SeenKeys = new Set();
  const rows: TorneopalPreviewRow[] = [];
  let line = 0;

  for (const fixture of input.parsed.fixtures) {
    const home = resolveClubSide(fixture.home, input.teams);
    const away = resolveClubSide(fixture.away, input.teams);
    const clubSides: { resolution: Extract<ClubSideResolution, { kind: "mapped" }>; side: MatchSide; opponentRaw: string }[] =
      [];
    if (home.kind === "mapped") {
      clubSides.push({ resolution: home, side: "home", opponentRaw: fixture.away });
    }
    if (away.kind === "mapped") {
      clubSides.push({ resolution: away, side: "away", opponentRaw: fixture.home });
    }

    const clubLookingUnmapped =
      (home.kind === "unmapped" && looksLikeClubTeamName(fixture.home)) ||
      (away.kind === "unmapped" && looksLikeClubTeamName(fixture.away));

    if (clubSides.length === 0 && !clubLookingUnmapped) {
      continue;
    }

    if (clubLookingUnmapped && clubSides.length === 0) {
      line += 1;
      const name = home.kind === "unmapped" ? fixture.home : fixture.away;
      rows.push({
        line,
        status: "error",
        errorKeys: ["unmappedTeam"],
        summary: `${name} · ${fixture.home} vs ${fixture.away}`,
        draft: null,
      });
      continue;
    }

    for (const side of clubSides) {
      line += 1;
      const extraErrors: OrgErrorKey[] = [];
      if (side.side === "home" && home.kind === "unmapped") {
        extraErrors.push("unmappedTeam");
      }
      if (side.side === "away" && away.kind === "unmapped") {
        extraErrors.push("unmappedTeam");
      }
      pushRow(rows, seen, existingKeys, {
        line,
        team: side.resolution.team,
        title: leagueTitle(input.parsed.pageTitle, fixture, side.opponentRaw),
        startsAt: fixture.startsAt,
        location: fixture.venue,
        opponent: side.opponentRaw,
        side: side.side,
        extraErrors,
      });
    }
  }

  if (rows.length === 0) {
    return { ok: false, errorKey: "torneopalNoClubMatches" };
  }
  if (rows.length > MAX_TORNEOPAL_ROWS) {
    return { ok: false, errorKey: "importTooLarge" };
  }

  return {
    ok: true,
    sourceUrl: input.sourceUrl,
    pageTitle: input.parsed.pageTitle,
    rows,
    createCount: rows.filter((row) => row.status === "create").length,
    skipCount: rows.filter((row) => row.status === "skip").length,
    errorCount: rows.filter((row) => row.status === "error").length,
  };
}

export function serializeTorneopalPreview(preview: TorneopalPreview): string {
  return JSON.stringify({
    sourceUrl: preview.sourceUrl,
    pageTitle: preview.pageTitle,
    rows: preview.rows.map((row) => ({
      line: row.line,
      status: row.status,
      errorKeys: [...row.errorKeys],
      summary: row.summary,
      draft: row.draft,
    })),
    createCount: preview.createCount,
    skipCount: preview.skipCount,
    errorCount: preview.errorCount,
  });
}

function isPreviewStatus(value: unknown): value is TorneopalPreviewStatus {
  return value === "create" || value === "skip" || value === "error";
}

export function parseTorneopalPreviewJson(raw: string): TorneopalPreview | null {
  try {
    const parsed = JSON.parse(raw) as TorneopalPreview;
    if (!parsed || !Array.isArray(parsed.rows) || typeof parsed.sourceUrl !== "string") {
      return null;
    }
    if (!parsed.rows.every((row) => isPreviewStatus(row.status))) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
