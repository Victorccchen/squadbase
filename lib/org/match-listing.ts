/**
 * Admin listing fields for a match (spec v4 §5.6, §8.2): opponent club, public
 * venue, season, competition, round. Pure parser for the form.
 */

import { parseUuid } from "./parse.ts";

export const MAX_ROUND_NO = 99;
export const MAX_ROUND_LABEL = 40;

export type ParsedMatchListing =
  | {
      ok: true;
      opponentClubId: string | null;
      publicVenueId: string | null;
      seasonId: string | null;
      competitionId: string | null;
      roundNo: number | null;
      roundLabel: string | null;
    }
  | { ok: false; errorKey: "invalidListing" };

function optionalUuid(value: string): { ok: true; id: string | null } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, id: null };
  }
  const id = parseUuid(trimmed);
  return id ? { ok: true, id } : { ok: false };
}

export function parseMatchListingForm(input: {
  opponentClubId: string;
  publicVenueId: string;
  seasonId: string;
  competitionId: string;
  roundNo: string;
  roundLabel: string;
}): ParsedMatchListing {
  const club = optionalUuid(input.opponentClubId);
  const venue = optionalUuid(input.publicVenueId);
  const season = optionalUuid(input.seasonId);
  const competition = optionalUuid(input.competitionId);
  if (!club.ok || !venue.ok || !season.ok || !competition.ok) {
    return { ok: false, errorKey: "invalidListing" };
  }

  const roundRaw = input.roundNo.trim();
  let roundNo: number | null = null;
  if (roundRaw) {
    if (!/^\d{1,2}$/.test(roundRaw)) {
      return { ok: false, errorKey: "invalidListing" };
    }
    roundNo = Number(roundRaw);
    if (roundNo < 1 || roundNo > MAX_ROUND_NO) {
      return { ok: false, errorKey: "invalidListing" };
    }
  }

  const label = input.roundLabel.trim();
  if (label.length > MAX_ROUND_LABEL) {
    return { ok: false, errorKey: "invalidListing" };
  }

  return {
    ok: true,
    opponentClubId: club.id,
    publicVenueId: venue.id,
    seasonId: season.id,
    competitionId: competition.id,
    roundNo,
    roundLabel: label || null,
  };
}
