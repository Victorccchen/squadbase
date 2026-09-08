import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadMessages(locale: "zh-Hant" | "en" | "ja"): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, "messages", `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function at(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    return (value as Record<string, unknown>)[key];
  }, source);
}

const REQUIRED_KEYS = [
  "nav.sessions",
  "nav.competitions",
  "nav.matches",
  "app.placeholders.sessions.title",
  "app.placeholders.competitions.title",
  "app.openCompetitions",
  "sessions.title",
  "competitions.title",
  "competitions.attendSeries",
  "competitions.cancelSeries",
  "calendar.google",
  "calendar.apple",
  "calendar.outlook",
  "calendar.ics",
  "sessions.kinds.friendly",
  "admin.calendarView",
  "admin.listView",
  "admin.viewToggleLabel",
  "admin.listWindowHint",
  "admin.loadMore",
  "admin.seeEarlier",
  "admin.resetListWindow",
  "admin.listWindowEmptyTitle",
  "admin.listWindowEmptyBody",
  "org.firstTeam",
  "org.secondTeam",
  "org.addSecondTeam",
  "org.removeSecondTeam",
  "org.membershipRuleHint",
  "org.ageBandNotAllowed",
  "org.playingUpNote",
  "org.kindAgeSquad",
  "org.kindCompetitionTeam",
  "org.continuesTraining",
  "org.jerseyHintSquad",
  "org.errors.tooManyActiveMemberships",
  "org.errors.membershipBandNotAllowed",
  "org.errors.membershipBirthNotEligible",
  "org.errors.membershipLayerConflict",
  "org.errors.continuesTrainingRequired",
  "org.errors.invalidTeamKind",
  "org.errors.duplicateMembershipTeam",
  "org.errors.jerseyTaken",
  "org.errors.partialTeamCreates",
  "admin.createAgeSquad",
  "admin.createCompetitionTeam",
  "admin.ageSquadsEmptyTitle",
  "admin.competitionTeamsEmptyTitle",
  "admin.multiTeamNone",
  "admin.multiTeamRowOk",
  "matches.createTeamsHint",
  "admin.softDeleteOccurrenceConfirm",
  "matches.softDeleteMatch",
  "matches.softDeleteMatchConfirm",
  "matches.matchDeleted",
  "matches.matchDeletedBanner",
  "sessions.createTeamsHint",
  "matches.parentRegistrationsTitle",
  "matches.parentRegistrationsHint",
  "matches.parentRegistrationsEmptyTitle",
  "matches.parentRegistrationsEmptyBody",
  "matches.parentRegisteredBadge",
  "matches.staffRosterTitle",
  "matches.staffRosterHint",
];

describe("T6P-9 locale smoke", () => {
  it("has Stage 6P copy keys in zh-Hant, en, and ja", () => {
    for (const locale of ["zh-Hant", "en", "ja"] as const) {
      const messages = loadMessages(locale);
      for (const key of REQUIRED_KEYS) {
        const value = at(messages, key);
        assert.equal(typeof value, "string", `${locale} missing ${key}`);
        assert.ok(String(value).length > 0, `${locale} empty ${key}`);
      }
    }
  });
});
