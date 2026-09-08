/**
 * Stage 6A row-level parsing (no database). Catalog validation is separate.
 */

import {
  parseBirthDate,
  parseJersey,
  parseOptionalBoundedText,
  parseRequiredBoundedText,
  parseUuid,
  playerNamesError,
} from "./parse.ts";
import {
  DEFAULT_MATCH_DURATION_MINUTES,
  parseMatchKind,
  parseMatchOpponent,
  parseMatchSide,
  type MatchKind,
  type MatchSide,
} from "./match.ts";
import {
  addMinutesToOffsetIso,
  isEndsAfterStart,
  MAX_SESSION_LOCATION,
  MAX_SESSION_NOTES,
  MAX_SESSION_TITLE,
  parseClubDateTimeLocal,
} from "./session-time.ts";
import { isE164, toE164 } from "../auth/phone.ts";
import type { OrgErrorKey } from "./errors.ts";

export type PlayerImportDraft = {
  nameEnGiven: string;
  nameEnFamily: string;
  nameZh: string | null;
  nameJa: string | null;
  birthDate: string;
  continuesTraining: boolean;
  ageSquadRef: string;
  ageSquadJersey: number;
  competition: { ref: string; jersey: number }[];
};

export type CoachImportDraft = {
  profileId: string | null;
  phoneE164: string | null;
  teamRefs: string[];
};

export type MatchImportDraft = {
  teamRef: string;
  title: string;
  kind: MatchKind;
  startsAt: string;
  endsAt: string;
  location: string | null;
  opponent: string | null;
  side: MatchSide;
  isPlayoff: boolean;
  isPublished: boolean;
  notes: string | null;
};

export function cell(values: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = values[key];
    if (value != null && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

export function parseImportBool(value: string, defaultValue: boolean): boolean {
  const raw = value.trim().toLowerCase();
  if (!raw) {
    return defaultValue;
  }
  if (["true", "1", "yes", "y", "on"].includes(raw)) {
    return true;
  }
  if (["false", "0", "no", "n", "off"].includes(raw)) {
    return false;
  }
  return defaultValue;
}

export function parseImportPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const compact = trimmed.replaceAll(/[()\s-]/g, "");
  if (isE164(compact)) {
    return compact;
  }
  if (compact.startsWith("+") && isE164(compact)) {
    return compact;
  }
  return toE164("+886", compact);
}

export function parseImportDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const local = parseClubDateTimeLocal(trimmed);
  if (local) {
    return local;
  }
  const spaced = trimmed.includes(" ") && !trimmed.includes("T") ? trimmed.replace(" ", "T") : trimmed;
  const localSpaced = parseClubDateTimeLocal(spaced);
  if (localSpaced) {
    return localSpaced;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
}

export function parsePlayerImportValues(
  values: Record<string, string>,
  todayIso: string,
): { ok: true; draft: PlayerImportDraft } | { ok: false; errorKeys: OrgErrorKey[] } {
  const errorKeys: OrgErrorKey[] = [];
  const nameEnGiven = cell(values, "name_en_given");
  const nameEnFamily = cell(values, "name_en_family");
  const nameZh = cell(values, "name_zh") || null;
  const nameJa = cell(values, "name_ja") || null;
  const nameError = playerNamesError({
    nameEnGiven,
    nameEnFamily,
    nameZh,
    nameJa,
  });
  if (nameError) {
    errorKeys.push(nameError);
  }

  const birthRaw = cell(values, "birth_date");
  const birthDate = parseBirthDate(birthRaw, todayIso);
  if (birthDate === "future") {
    errorKeys.push("futureBirthDate");
  } else if (!birthDate) {
    errorKeys.push("invalidBirthDate");
  }

  const ageSquadRef = cell(values, "age_squad_id", "age_squad_name", "age_squad", "squad_name");
  if (!ageSquadRef) {
    errorKeys.push("missingAgeSquad");
  }
  const jersey = parseJersey(cell(values, "age_squad_jersey", "jersey", "squad_jersey"));
  if (jersey === null) {
    errorKeys.push("invalidJersey");
  }

  const competition: { ref: string; jersey: number }[] = [];
  const slots = [
    {
      ref: cell(values, "competition_team_1_id", "competition_team_1_name", "team_id", "team_name"),
      jerseyRaw: cell(values, "competition_team_1_jersey", "jersey_1"),
    },
    {
      ref: cell(values, "competition_team_2_id", "competition_team_2_name"),
      jerseyRaw: cell(values, "competition_team_2_jersey", "jersey_2"),
    },
  ];
  const seenRefs = new Set<string>();
  for (const slot of slots) {
    if (!slot.ref && !slot.jerseyRaw) {
      continue;
    }
    if (!slot.ref) {
      errorKeys.push("missingTeam");
      continue;
    }
    const slotJersey = parseJersey(slot.jerseyRaw);
    if (slotJersey === null) {
      errorKeys.push("invalidJersey");
      continue;
    }
    const key = slot.ref.toLowerCase();
    if (seenRefs.has(key)) {
      errorKeys.push("duplicateMembershipTeam");
      continue;
    }
    seenRefs.add(key);
    competition.push({ ref: slot.ref, jersey: slotJersey });
  }
  if (competition.length > 2) {
    errorKeys.push("tooManyActiveMemberships");
  }

  if (errorKeys.length > 0 || !birthDate || birthDate === "future" || jersey === null || !ageSquadRef) {
    return { ok: false, errorKeys: uniqueKeys(errorKeys) };
  }

  return {
    ok: true,
    draft: {
      nameEnGiven,
      nameEnFamily,
      nameZh,
      nameJa,
      birthDate,
      continuesTraining: parseImportBool(cell(values, "continues_training"), true),
      ageSquadRef,
      ageSquadJersey: jersey,
      competition,
    },
  };
}

export function parseCoachImportValues(
  values: Record<string, string>,
): { ok: true; draft: CoachImportDraft } | { ok: false; errorKeys: OrgErrorKey[] } {
  const profileId = parseUuid(cell(values, "profile_id"));
  const phoneE164 = parseImportPhone(cell(values, "profile_phone_e164", "phone", "phone_e164"));
  if (!profileId && !phoneE164) {
    return { ok: false, errorKeys: ["unknownProfilePhone"] };
  }

  const teamRefs = [
    cell(values, "team_1_id", "team_1_name"),
    cell(values, "team_2_id", "team_2_name"),
    cell(values, "team_3_id", "team_3_name"),
  ].filter(Boolean);

  return {
    ok: true,
    draft: {
      profileId,
      phoneE164,
      teamRefs,
    },
  };
}

export function parseMatchImportValues(
  values: Record<string, string>,
): { ok: true; draft: MatchImportDraft } | { ok: false; errorKeys: OrgErrorKey[] } {
  const errorKeys: OrgErrorKey[] = [];
  const teamRef = cell(values, "team_id", "team_name", "team");
  if (!teamRef) {
    errorKeys.push("missingTeam");
  }

  const title = parseRequiredBoundedText(cell(values, "title"), MAX_SESSION_TITLE);
  if (!title) {
    errorKeys.push("missingTitle");
  }

  const kindRaw = cell(values, "kind", "session_kind").toLowerCase();
  if (kindRaw === "regular" || kindRaw === "special" || kindRaw === "training") {
    errorKeys.push("matchKindRequired");
  }
  const kind = parseMatchKind(kindRaw);
  if (!kind && kindRaw !== "regular" && kindRaw !== "special" && kindRaw !== "training") {
    errorKeys.push("matchKindRequired");
  }

  const startsAt = parseImportDateTime(cell(values, "starts_at", "kickoff"));
  if (!startsAt) {
    errorKeys.push("invalidSessionTime");
  }

  let endsAt = parseImportDateTime(cell(values, "ends_at"));
  if (!endsAt && startsAt) {
    endsAt = addMinutesToOffsetIso(startsAt, DEFAULT_MATCH_DURATION_MINUTES);
  }
  if (startsAt && endsAt && !isEndsAfterStart(startsAt, endsAt)) {
    errorKeys.push("endsBeforeStart");
  }
  if (!endsAt) {
    errorKeys.push("invalidSessionTime");
  }

  const opponentParsed = parseMatchOpponent(cell(values, "opponent"));
  if (!opponentParsed.ok) {
    errorKeys.push("invalidOpponent");
  }

  const sideRaw = cell(values, "side");
  const side = sideRaw ? parseMatchSide(sideRaw.toLowerCase()) : "home";
  if (sideRaw && !side) {
    errorKeys.push("invalidMatchSide");
  }

  if (errorKeys.length > 0 || !kind || !title || !startsAt || !endsAt || !teamRef) {
    return { ok: false, errorKeys: uniqueKeys(errorKeys) };
  }

  const isPlayoff = kind === "league" && parseImportBool(cell(values, "is_playoff"), false);
  const isPublished = parseImportBool(cell(values, "is_published"), false);

  return {
    ok: true,
    draft: {
      teamRef,
      title,
      kind,
      startsAt,
      endsAt,
      location: parseOptionalBoundedText(cell(values, "location"), MAX_SESSION_LOCATION),
      opponent: opponentParsed.ok ? opponentParsed.opponent : null,
      side: side ?? "home",
      isPlayoff,
      isPublished,
      notes: parseOptionalBoundedText(cell(values, "notes"), MAX_SESSION_NOTES),
    },
  };
}

function uniqueKeys(keys: OrgErrorKey[]): OrgErrorKey[] {
  return [...new Set(keys)];
}

export function playerDuplicateKey(input: {
  nameEnGiven: string;
  nameEnFamily: string;
  birthDate: string;
}): string {
  return `${input.nameEnGiven.trim().toLowerCase()}|${input.nameEnFamily.trim().toLowerCase()}|${input.birthDate}`;
}
