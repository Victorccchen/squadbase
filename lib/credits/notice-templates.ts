/**
 * Stage N: admin LINE-group announcement templates (generate + copy only).
 * Does not send LINE, SMS, OA, or push. Coexists with Stage 4B debit notices.
 */

import {
  AGE_BANDS,
  ageSquadBandFromCompletedAge,
  isBirthAgeLabel,
  type AgeBand,
  type ComputedAgeBand,
} from "../age-band.ts";
import { canAccessAdmin } from "../auth/roles.ts";
import { isMatchKind } from "../org/match.ts";
import { isAgeSquad, isCompetitionTeam } from "../org/squad-team.ts";
import type { AppRole, SessionKind } from "../supabase/database.types.ts";
import {
  publicMatchUrl,
  sessionSignupUrl,
  type NoticeLocale,
} from "./notice.ts";

export type { NoticeLocale };

export const NOTICE_TEMPLATE_KEYS = [
  "regular_training_signup",
  "special_training_signup",
  "match_signup",
  "match_notes",
  "thanks",
  "match_report",
] as const;
export type NoticeTemplateKey = (typeof NOTICE_TEMPLATE_KEYS)[number];

export const NOTICE_AUDIENCE_KEYS = [
  "age_squad",
  "competition_team",
  "session_registrations",
] as const;
export type NoticeAudienceKey = (typeof NOTICE_AUDIENCE_KEYS)[number];

export const NOTICE_COPY_LOCALES: readonly NoticeLocale[] = ["zh-Hant", "en", "ja"];

const BAND_ORDER = AGE_BANDS as readonly string[];

export type NoticeTeamRef = {
  id?: string;
  name?: string | null;
  kind?: string | null;
  age_band?: string | null;
  eligible_birth_ages?: readonly string[] | null;
};

export type NoticeSourceSnapshot = {
  id: string;
  title: string;
  kind: SessionKind;
  startsAt: string;
  endsAt: string;
  location: string;
  teamId: string;
  teamName: string;
  teamKind: string | null;
  teamAgeBand: string | null;
  eligibleBirthAges: string[];
  registeredCount: number;
  opponent: string;
  score: string;
  recap: string;
  publicStatus: string | null;
};

export type AnnouncementFields = {
  title: string;
  timeRange: string;
  location: string;
  team: string;
  appUrl: string;
  publicUrl: string;
  deadline: string;
  registeredCount: number;
  opponent: string;
  score: string;
  recap: string;
  kit: string;
  gear: string;
  gather: string;
};

export type AnnouncementPaste = {
  groupBand: AgeBand | null;
  text: string;
};

export function canGenerateNotices(roles: readonly AppRole[]): boolean {
  return canAccessAdmin([...roles]);
}

export function isNoticeTemplateKey(value: string): value is NoticeTemplateKey {
  return (NOTICE_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function isNoticeAudienceKey(value: string): value is NoticeAudienceKey {
  return (NOTICE_AUDIENCE_KEYS as readonly string[]).includes(value);
}

export function parseNoticeTemplateKey(value: string | null | undefined): NoticeTemplateKey | null {
  const trimmed = value?.trim() ?? "";
  return isNoticeTemplateKey(trimmed) ? trimmed : null;
}

export function parseNoticeAudienceKey(value: string | null | undefined): NoticeAudienceKey | null {
  const trimmed = value?.trim() ?? "";
  return isNoticeAudienceKey(trimmed) ? trimmed : null;
}

export function suggestedNoticeTemplate(
  kind: string,
  publicStatus?: string | null,
): NoticeTemplateKey {
  if (kind === "regular") {
    return "regular_training_signup";
  }
  if (kind === "special") {
    return "special_training_signup";
  }
  if (isMatchKind(kind) && publicStatus === "completed") {
    return "match_report";
  }
  if (isMatchKind(kind)) {
    return "match_signup";
  }
  return "regular_training_signup";
}

export function suggestedNoticeAudience(teamKind: string | null | undefined): NoticeAudienceKey {
  if (teamKind === "competition_team") {
    return "competition_team";
  }
  if (teamKind === "age_squad") {
    return "age_squad";
  }
  return "session_registrations";
}

export function announcementAppUrl(
  origin: string,
  locale: NoticeLocale,
  sessionId: string,
  kind?: string,
): string {
  return sessionSignupUrl(origin, locale, sessionId, kind);
}

export function announcementPublicUrl(
  origin: string,
  locale: NoticeLocale,
  matchId: string,
): string {
  return publicMatchUrl(origin, locale, matchId);
}

/**
 * Birth-age Un → roster 梯隊. U8 → U8; U9 → U10 (Futuro U9 spans those LINE groups).
 */
export function ageSquadBandFromBirthAgeLabel(label: string): ComputedAgeBand | null {
  if (!isBirthAgeLabel(label)) {
    return null;
  }
  if (label === "senior") {
    return "senior";
  }
  const age = Number(label.slice(1));
  if (!Number.isInteger(age)) {
    return null;
  }
  return ageSquadBandFromCompletedAge(age);
}

export function lineGroupBandsForTeam(team: NoticeTeamRef | null | undefined): AgeBand[] {
  if (!team) {
    return [];
  }
  if (isAgeSquad(team) && team.age_band) {
    return BAND_ORDER.includes(team.age_band) ? [team.age_band as AgeBand] : [];
  }
  if (!isCompetitionTeam(team)) {
    return [];
  }
  const bands = new Set<AgeBand>();
  for (const raw of team.eligible_birth_ages ?? []) {
    const band = ageSquadBandFromBirthAgeLabel(raw);
    if (band) {
      bands.add(band);
    }
  }
  return [...bands].sort((a, b) => BAND_ORDER.indexOf(a) - BAND_ORDER.indexOf(b));
}

export function pasteGroupsForAudience(input: {
  audience: NoticeAudienceKey;
  sourceTeam?: NoticeTeamRef | null;
  selectedTeam?: NoticeTeamRef | null;
}): AgeBand[] {
  if (input.audience === "age_squad") {
    const team = input.selectedTeam ?? input.sourceTeam;
    if (team && isAgeSquad(team) && team.age_band && BAND_ORDER.includes(team.age_band)) {
      return [team.age_band as AgeBand];
    }
    if (team?.age_band && BAND_ORDER.includes(team.age_band) && !isCompetitionTeam(team)) {
      return [team.age_band as AgeBand];
    }
    return [];
  }
  const team =
    input.audience === "competition_team"
      ? (input.selectedTeam ?? input.sourceTeam)
      : input.sourceTeam;
  return lineGroupBandsForTeam(team);
}

function present(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function labeled(label: string, value: string, omitEmpty: boolean): string | null {
  const trimmed = present(value);
  if (!trimmed) {
    return omitEmpty ? null : `${label}—`;
  }
  return `${label}${trimmed}`;
}

function groupGreeting(locale: NoticeLocale, band: AgeBand): string {
  if (locale === "zh-Hant") {
    return `梯隊 ${band} 家長您好：`;
  }
  if (locale === "ja") {
    return `梯隊 ${band} の保護者の皆さま：`;
  }
  return `Hello ${band} parents:`;
}

type CopyLabels = {
  club: string;
  headings: Record<NoticeTemplateKey, string>;
  time: string;
  place: string;
  squad: string;
  team: string;
  signup: string;
  deadline: string;
  registered: string;
  opponent: string;
  gather: string;
  kit: string;
  gear: string;
  details: string;
  thanksBody: (title: string) => string;
  score: string;
  recap: string;
  appLink: string;
  publicLink: string;
  wake: string;
};

function labelsFor(locale: NoticeLocale): CopyLabels {
  if (locale === "zh-Hant") {
    return {
      club: "【球團】",
      headings: {
        regular_training_signup: "例行訓練報名",
        special_training_signup: "特別訓練報名",
        match_signup: "比賽報名",
        match_notes: "出賽注意",
        thanks: "謝謝各位家長",
        match_report: "賽後簡報",
      },
      time: "時間：",
      place: "地點：",
      squad: "梯隊：",
      team: "隊伍：",
      signup: "報名連結：",
      deadline: "報名截止：",
      registered: "目前報名人數：",
      opponent: "對手：",
      gather: "集合：",
      kit: "裝備：",
      gear: "用品：",
      details: "詳情：",
      thanksBody: (title) => `感謝參與「${title}」。請以 App 為準。`,
      score: "比分：",
      recap: "簡記：",
      appLink: "App：",
      publicLink: "公開賽程：",
      wake: "請在 App 內完成報名與確認（LINE 僅提醒）。",
    };
  }
  if (locale === "ja") {
    return {
      club: "【クラブ】",
      headings: {
        regular_training_signup: "通常練習の申込",
        special_training_signup: "特別練習の申込",
        match_signup: "試合申込",
        match_notes: "試合の注意",
        thanks: "保護者の皆さまへお礼",
        match_report: "試合レポート",
      },
      time: "時間：",
      place: "場所：",
      squad: "梯隊：",
      team: "隊伍：",
      signup: "申込リンク：",
      deadline: "締切：",
      registered: "現在の申込人数：",
      opponent: "対戦相手：",
      gather: "集合：",
      kit: "用具：",
      gear: "持ち物：",
      details: "詳細：",
      thanksBody: (title) => `「${title}」へのご参加ありがとうございました。内容はアプリが正です。`,
      score: "スコア：",
      recap: "メモ：",
      appLink: "アプリ：",
      publicLink: "公開日程：",
      wake: "申込と確認はアプリで行ってください（LINE はお知らせのみ）。",
    };
  }
  return {
    club: "[Club] ",
    headings: {
      regular_training_signup: "Regular training signup",
      special_training_signup: "Special training signup",
      match_signup: "Match signup",
      match_notes: "Match notes",
      thanks: "Thank you",
      match_report: "Match recap",
    },
    time: "Time: ",
    place: "Place: ",
    squad: "Age squad: ",
    team: "Team: ",
    signup: "Signup: ",
    deadline: "Deadline: ",
    registered: "Registered: ",
    opponent: "Opponent: ",
    gather: "Meet-up: ",
    kit: "Kit: ",
    gear: "Gear: ",
    details: "Details: ",
    thanksBody: (title) => `Thank you for taking part in “${title}”. The app is the source of truth.`,
    score: "Score: ",
    recap: "Note: ",
    appLink: "App: ",
    publicLink: "Public match: ",
    wake: "Please sign up and confirm in the app (LINE is only a reminder).",
  };
}

function unitLabel(labels: CopyLabels, audience: NoticeAudienceKey): string {
  return audience === "age_squad" ? labels.squad : labels.team;
}

export function buildAnnouncementCopy(
  locale: NoticeLocale,
  template: NoticeTemplateKey,
  fields: AnnouncementFields,
  options?: { audience?: NoticeAudienceKey; groupBand?: AgeBand | null },
): string {
  const labels = labelsFor(locale);
  const audience = options?.audience ?? "session_registrations";
  const title = present(fields.title) || "—";
  const appUrl = present(fields.appUrl);
  const publicUrl = present(fields.publicUrl);
  const team = present(fields.team);
  const omitNotes = template === "match_notes";
  const lines: (string | null)[] = [];

  if (options?.groupBand) {
    lines.push(groupGreeting(locale, options.groupBand));
  }

  lines.push(`${labels.club}${labels.headings[template]}`);

  if (template === "thanks") {
    lines.push(labels.thanksBody(title));
    if (appUrl) {
      lines.push(`${labels.details}${appUrl}`);
    }
    return lines.filter((row): row is string => row !== null && row.length > 0).join("\n");
  }

  const titleLabel = locale === "en" ? "Title: " : locale === "ja" ? "タイトル：" : "標題：";
  lines.push(`${titleLabel}${title}`);
  lines.push(labeled(labels.time, fields.timeRange, omitNotes));
  lines.push(labeled(labels.place, fields.location, omitNotes));
  lines.push(labeled(unitLabel(labels, audience), team, false));

  if (template === "regular_training_signup" || template === "special_training_signup") {
    if (appUrl) {
      lines.push(`${labels.signup}${appUrl}`);
    }
    lines.push(labeled(labels.deadline, fields.deadline, true));
    lines.push(`${labels.registered}${String(fields.registeredCount)}`);
    lines.push(labels.wake);
  }

  if (template === "match_signup") {
    lines.push(labeled(labels.opponent, fields.opponent, true));
    if (appUrl) {
      lines.push(`${labels.signup}${appUrl}`);
    }
    lines.push(`${labels.registered}${String(fields.registeredCount)}`);
    lines.push(labels.wake);
  }

  if (template === "match_notes") {
    lines.push(labeled(labels.gather, fields.gather, true));
    lines.push(labeled(labels.kit, fields.kit, true));
    lines.push(labeled(labels.gear, fields.gear, true));
    if (appUrl) {
      lines.push(`${labels.details}${appUrl}`);
    }
  }

  if (template === "match_report") {
    lines.push(labeled(labels.opponent, fields.opponent, true));
    lines.push(labeled(labels.score, fields.score, true));
    lines.push(labeled(labels.recap, fields.recap, true));
    if (appUrl) {
      lines.push(`${labels.appLink}${appUrl}`);
    }
    if (publicUrl) {
      lines.push(`${labels.publicLink}${publicUrl}`);
    }
  }

  return lines.filter((row): row is string => row !== null && row.length > 0).join("\n");
}

export function buildAnnouncementPastes(
  locale: NoticeLocale,
  template: NoticeTemplateKey,
  fields: AnnouncementFields,
  input: {
    audience: NoticeAudienceKey;
    sourceTeam?: NoticeTeamRef | null;
    selectedTeam?: NoticeTeamRef | null;
  },
): AnnouncementPaste[] {
  const bands = pasteGroupsForAudience(input);
  const dual = bands.length > 1;
  if (!dual) {
    return [
      {
        groupBand: bands[0] ?? null,
        text: buildAnnouncementCopy(locale, template, fields, {
          audience: input.audience,
          groupBand: null,
        }),
      },
    ];
  }
  return bands.map((band) => ({
    groupBand: band,
    text: buildAnnouncementCopy(locale, template, fields, {
      audience: input.audience,
      groupBand: band,
    }),
  }));
}

const PHONE_RE = /(?:\+886[-\s]?|0)9\d{2}[-\s]?\d{3}[-\s]?\d{3}/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Group copy must not include parent phones or emails. Names are never auto-inserted. */
export function groupCopyLooksLikeParentPii(text: string): boolean {
  return PHONE_RE.test(text) || EMAIL_RE.test(text);
}

export function announcementFieldsFromSource(
  source: NoticeSourceSnapshot,
  extras: {
    origin: string;
    locale: NoticeLocale;
    timeRange: string;
    deadline: string;
    kit?: string;
    gear?: string;
    gather?: string;
    recap?: string;
  },
): AnnouncementFields {
  const match = isMatchKind(source.kind);
  return {
    title: source.title,
    timeRange: extras.timeRange,
    location: source.location,
    team: source.teamName,
    appUrl: announcementAppUrl(extras.origin, extras.locale, source.id, source.kind),
    publicUrl: match ? announcementPublicUrl(extras.origin, extras.locale, source.id) : "",
    deadline: extras.deadline,
    registeredCount: source.registeredCount,
    opponent: source.opponent,
    score: source.score,
    recap: extras.recap ?? source.recap,
    kit: extras.kit ?? "",
    gear: extras.gear ?? "",
    gather: extras.gather ?? "",
  };
}
