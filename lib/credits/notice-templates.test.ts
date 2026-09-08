import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FUTURO_COMPETITION_TEAMS } from "../org/squad-team.ts";
import {
  announcementFieldsFromSource,
  buildAnnouncementCopy,
  buildAnnouncementPastes,
  canGenerateNotices,
  groupCopyLooksLikeParentPii,
  lineGroupBandsForTeam,
  pasteGroupsForAudience,
  suggestedNoticeAudience,
  suggestedNoticeTemplate,
  type AnnouncementFields,
  type NoticeSourceSnapshot,
} from "./notice-templates.ts";

const origin = "https://app.example";
const sessionId = "11111111-1111-4111-8111-111111111111";
const matchId = "22222222-2222-4222-8222-222222222222";

const trainingFields: AnnouncementFields = {
  title: "U8 Tuesday",
  timeRange: "Tue 18:00 – 19:30",
  location: "Pitch A",
  team: "梯隊 U8",
  appUrl: `${origin}/zh-Hant/app/sessions/${sessionId}`,
  publicUrl: "",
  deadline: "Tue 18:00",
  registeredCount: 7,
  opponent: "",
  score: "",
  recap: "",
  kit: "",
  gear: "",
  gather: "",
};

const u9Team = FUTURO_COMPETITION_TEAMS.find((row) => row.name === "Futuro U9")!;

const matchSource: NoticeSourceSnapshot = {
  id: matchId,
  title: "Futuro U9 friendly",
  kind: "friendly",
  startsAt: "2026-09-12T10:00:00.000+08:00",
  endsAt: "2026-09-12T11:30:00.000+08:00",
  location: "Pitch B",
  teamId: "team-u9",
  teamName: "Futuro U9",
  teamKind: "competition_team",
  teamAgeBand: "U8",
  eligibleBirthAges: [...u9Team.eligibleBirthAges],
  registeredCount: 11,
  opponent: "Rivals",
  score: "2 – 1",
  recap: "Good pressing.",
  publicStatus: "completed",
};

function loadMessages(locale: "zh-Hant" | "en" | "ja"): Record<string, unknown> {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
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

describe("TN-1 training link", () => {
  it("regular training copy includes the app session deep link", () => {
    const zh = buildAnnouncementCopy("zh-Hant", "regular_training_signup", trainingFields);
    assert.match(zh, /例行訓練報名/);
    assert.match(zh, /報名連結：https:\/\/app\.example\/zh-Hant\/app\/sessions\/11111111-1111-4111-8111-111111111111/);
    assert.doesNotMatch(zh, /\/app\/competitions\//);
    assert.equal(groupCopyLooksLikeParentPii(zh), false);
  });

  it("special training copy also uses the training session path", () => {
    const en = buildAnnouncementCopy("en", "special_training_signup", {
      ...trainingFields,
      appUrl: `${origin}/en/app/sessions/${sessionId}`,
    });
    assert.match(en, /Special training signup/);
    assert.match(en, /Signup: https:\/\/app\.example\/en\/app\/sessions\//);
  });
});

describe("TN-2 match notes omit empty fields", () => {
  it("keeps kit and drops blank gather/gear lines", () => {
    const zh = buildAnnouncementCopy("zh-Hant", "match_notes", {
      title: "Cup",
      timeRange: "Sat 09:00 – 10:30",
      location: "Stadium",
      team: "Futuro U8",
      appUrl: `${origin}/zh-Hant/app/competitions/${matchId}`,
      publicUrl: `${origin}/zh-Hant/matches/${matchId}`,
      deadline: "",
      registeredCount: 0,
      opponent: "",
      score: "",
      recap: "",
      kit: "釘鞋、護脛",
      gear: "",
      gather: "",
    });
    assert.match(zh, /裝備：釘鞋、護脛/);
    assert.doesNotMatch(zh, /集合：/);
    assert.doesNotMatch(zh, /用品：/);
    assert.doesNotMatch(zh, /對手：/);
    assert.doesNotMatch(zh, /比分：/);
  });
});

describe("TN-3 registered count", () => {
  it("includes session_registrations registered count on signup copy", () => {
    const zh = buildAnnouncementCopy(
      "zh-Hant",
      "match_signup",
      announcementFieldsFromSource(matchSource, {
        origin,
        locale: "zh-Hant",
        timeRange: "Sat 09:00 – 10:30",
        deadline: "",
      }),
      { audience: "session_registrations" },
    );
    assert.match(zh, /目前報名人數：11/);
    assert.match(zh, /\/zh-Hant\/app\/competitions\/22222222-2222-4222-8222-222222222222/);
    assert.doesNotMatch(zh, /0900123456/);
    assert.doesNotMatch(zh, /parent@example/);
  });
});

describe("TN-4 U9 dual-paste suggestion", () => {
  it("Futuro U9 maps to 梯隊 U8 and U10 LINE groups", () => {
    assert.deepEqual(
      lineGroupBandsForTeam({
        kind: "competition_team",
        age_band: "U8",
        eligible_birth_ages: [...u9Team.eligibleBirthAges],
      }),
      ["U8", "U10"],
    );
  });

  it("preview suggests two paste texts with the same app link", () => {
    const fields = announcementFieldsFromSource(matchSource, {
      origin,
      locale: "zh-Hant",
      timeRange: "Sat 09:00 – 10:30",
      deadline: "",
    });
    const pastes = buildAnnouncementPastes("zh-Hant", "match_signup", fields, {
      audience: "competition_team",
      sourceTeam: {
        kind: "competition_team",
        age_band: "U8",
        eligible_birth_ages: [...u9Team.eligibleBirthAges],
        name: "Futuro U9",
      },
    });
    assert.equal(pastes.length, 2);
    assert.equal(pastes[0]?.groupBand, "U8");
    assert.equal(pastes[1]?.groupBand, "U10");
    assert.match(pastes[0]!.text, /梯隊 U8 家長您好：/);
    assert.match(pastes[1]!.text, /梯隊 U10 家長您好：/);
    const link = `https://app.example/zh-Hant/app/competitions/${matchId}`;
    assert.match(pastes[0]!.text, new RegExp(link.replaceAll("/", "\\/")));
    assert.match(pastes[1]!.text, new RegExp(link.replaceAll("/", "\\/")));
    assert.equal(pastes[0]!.text.includes(link), true);
    assert.equal(pastes[1]!.text.includes(link), true);
  });

  it("age_squad audience stays a single paste", () => {
    const groups = pasteGroupsForAudience({
      audience: "age_squad",
      selectedTeam: { kind: "age_squad", age_band: "U8", name: "梯隊 U8" },
      sourceTeam: {
        kind: "competition_team",
        eligible_birth_ages: [...u9Team.eligibleBirthAges],
      },
    });
    assert.deepEqual(groups, ["U8"]);
  });
});

describe("TN-5 non-admin denied", () => {
  it("parents, coaches, and empty roles cannot generate notices", () => {
    assert.equal(canGenerateNotices(["parent"]), false);
    assert.equal(canGenerateNotices(["coach"]), false);
    assert.equal(canGenerateNotices(["parent", "coach"]), false);
    assert.equal(canGenerateNotices([]), false);
    assert.equal(canGenerateNotices(["player"]), false);
  });

  it("admin may generate notices", () => {
    assert.equal(canGenerateNotices(["admin"]), true);
    assert.equal(canGenerateNotices(["parent", "admin"]), true);
  });
});

describe("TN-6 locale switch", () => {
  it("zh-Hant, en, and ja render distinct template skeletons", () => {
    const zh = buildAnnouncementCopy("zh-Hant", "regular_training_signup", trainingFields);
    const en = buildAnnouncementCopy("en", "regular_training_signup", trainingFields);
    const ja = buildAnnouncementCopy("ja", "regular_training_signup", trainingFields);
    assert.match(zh, /例行訓練報名/);
    assert.match(en, /Regular training signup/);
    assert.match(ja, /通常練習の申込/);
    assert.notEqual(zh, en);
    assert.notEqual(en, ja);
    assert.match(zh, /請在 App 內完成報名/);
    assert.match(en, /Please sign up and confirm in the app/);
    assert.match(ja, /申込と確認はアプリで/);
  });

  it("trilingual admin labels exist for templates and audiences", () => {
    const keys = [
      "nav.notices",
      "notices.title",
      "notices.generateCta",
      "notices.templates.regular_training_signup",
      "notices.templates.special_training_signup",
      "notices.templates.match_signup",
      "notices.templates.match_notes",
      "notices.templates.thanks",
      "notices.templates.match_report",
      "notices.audiences.age_squad",
      "notices.audiences.competition_team",
      "notices.audiences.session_registrations",
      "credits.noticeTitle",
    ];
    for (const locale of ["zh-Hant", "en", "ja"] as const) {
      const messages = loadMessages(locale);
      for (const key of keys) {
        const value = at(messages, key);
        assert.equal(typeof value, "string", `${locale} missing ${key}`);
        assert.ok(String(value).length > 0, `${locale} empty ${key}`);
      }
    }
  });
});

describe("Stage N helpers", () => {
  it("suggests templates from session kind and match status", () => {
    assert.equal(suggestedNoticeTemplate("regular"), "regular_training_signup");
    assert.equal(suggestedNoticeTemplate("special"), "special_training_signup");
    assert.equal(suggestedNoticeTemplate("friendly"), "match_signup");
    assert.equal(suggestedNoticeTemplate("league", "completed"), "match_report");
    assert.equal(suggestedNoticeAudience("age_squad"), "age_squad");
    assert.equal(suggestedNoticeAudience("competition_team"), "competition_team");
  });

  it("never copies parent phones, emails, or player names from unused records", () => {
    const parent = {
      name: "Wei Parent",
      phone: "0900123456",
      email: "parent@example.test",
    };
    const zh = buildAnnouncementCopy("zh-Hant", "thanks", trainingFields);
    assert.doesNotMatch(zh, new RegExp(parent.name));
    assert.doesNotMatch(zh, new RegExp(parent.phone));
    assert.doesNotMatch(zh, new RegExp(parent.email));
    assert.equal(groupCopyLooksLikeParentPii(zh), false);
  });

  it("match report includes app and public links and omits empty score", () => {
    const zh = buildAnnouncementCopy("zh-Hant", "match_report", {
      ...announcementFieldsFromSource(
        { ...matchSource, score: "", recap: "", opponent: "" },
        {
          origin,
          locale: "zh-Hant",
          timeRange: "Sat 09:00 – 10:30",
          deadline: "",
        },
      ),
    });
    assert.match(zh, /App：https:\/\/app\.example\/zh-Hant\/app\/competitions\//);
    assert.match(zh, /公開賽程：https:\/\/app\.example\/zh-Hant\/matches\//);
    assert.doesNotMatch(zh, /比分：/);
    assert.doesNotMatch(zh, /簡記：/);
    assert.doesNotMatch(zh, /對手：/);
  });
});
