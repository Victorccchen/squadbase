/**
 * Short Web Push title/body + deep link from Stage N templates.
 * Never include phones, street addresses, or roster names.
 */

import {
  groupCopyLooksLikeParentPii,
  type AnnouncementFields,
  type NoticeTemplateKey,
} from "../credits/notice-templates.ts";
import type { NoticeLocale } from "../credits/notice.ts";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

const HEADINGS: Record<NoticeLocale, Record<NoticeTemplateKey, string>> = {
  "zh-Hant": {
    regular_training_signup: "【球團】例行訓練報名",
    special_training_signup: "【球團】特別訓練報名",
    match_signup: "【球團】比賽報名",
    match_notes: "【球團】出賽注意",
    thanks: "【球團】謝謝各位家長",
    match_report: "【球團】賽後簡報",
  },
  en: {
    regular_training_signup: "[Club] Regular training signup",
    special_training_signup: "[Club] Special training signup",
    match_signup: "[Club] Match signup",
    match_notes: "[Club] Match notes",
    thanks: "[Club] Thank you",
    match_report: "[Club] Match recap",
  },
  ja: {
    regular_training_signup: "【クラブ】通常練習の申込",
    special_training_signup: "【クラブ】特別練習の申込",
    match_signup: "【クラブ】試合申込",
    match_notes: "【クラブ】試合の注意",
    thanks: "【クラブ】保護者の皆さまへお礼",
    match_report: "【クラブ】試合レポート",
  },
};

function present(value: string): string {
  return value.trim();
}

function thanksBody(locale: NoticeLocale, title: string): string {
  const safeTitle = present(title) || "—";
  if (locale === "zh-Hant") {
    return `感謝參與「${safeTitle}」。請以 App 為準。`;
  }
  if (locale === "ja") {
    return `「${safeTitle}」へのご参加ありがとうございました。内容はアプリが正です。`;
  }
  return `Thank you for taking part in “${safeTitle}”. The app is the source of truth.`;
}

export function buildPushPayload(
  locale: NoticeLocale,
  template: NoticeTemplateKey,
  fields: AnnouncementFields,
): PushPayload {
  const title = HEADINGS[locale][template];
  const eventTitle = present(fields.title) || "—";
  const time = present(fields.timeRange);
  const url = present(fields.appUrl);
  const extras: string[] = [];

  if (template === "thanks") {
    return { title, body: thanksBody(locale, eventTitle), url };
  }

  extras.push(eventTitle);
  if (time) {
    extras.push(time);
  }
  if (template === "match_signup" || template === "match_report") {
    const opponent = present(fields.opponent);
    if (opponent) {
      extras.push(opponent);
    }
  }
  if (template === "match_report") {
    const score = present(fields.score);
    if (score) {
      extras.push(score);
    }
  }
  if (template === "match_notes") {
    const gather = present(fields.gather);
    if (gather) {
      extras.push(gather);
    }
  }

  return {
    title,
    body: extras.join(" · "),
    url,
  };
}

export function pushPayloadLooksLikeParentPii(payload: PushPayload): boolean {
  return (
    groupCopyLooksLikeParentPii(payload.title) ||
    groupCopyLooksLikeParentPii(payload.body) ||
    groupCopyLooksLikeParentPii(payload.url)
  );
}
