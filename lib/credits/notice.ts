/**
 * Manual LINE-group notice copy (no Messaging API).
 * Staff copy/paste into existing LINE groups.
 */

export type NoticeLocale = "zh-Hant" | "en" | "ja";

export type SessionNoticeFields = {
  title: string;
  timeRange: string;
  location: string;
  team: string;
  debitLabel: string;
  signupUrl: string;
  deadline: string;
  registeredCount: number;
};

const MISSING = "—";

function present(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : MISSING;
}

export function buildLocaleNotice(
  locale: NoticeLocale,
  fields: SessionNoticeFields,
): string {
  const title = present(fields.title);
  const timeRange = present(fields.timeRange);
  const location = present(fields.location);
  const team = present(fields.team);
  const debit = present(fields.debitLabel);
  const url = present(fields.signupUrl);
  const deadline = present(fields.deadline);
  const count = String(fields.registeredCount);

  if (locale === "zh-Hant") {
    return [
      `【球團】${title}`,
      `時間：${timeRange}`,
      `地點：${location}`,
      `隊伍：${team}`,
      `扣堂：${debit}`,
      `報名連結：${url}`,
      `報名截止：${deadline}`,
      `目前報名人數：${count}`,
    ].join("\n");
  }

  if (locale === "ja") {
    return [
      `【クラブ】${title}`,
      `時間：${timeRange}`,
      `場所：${location}`,
      `チーム：${team}`,
      `減算：${debit}`,
      `申込リンク：${url}`,
      `締切：${deadline}`,
      `現在の申込人数：${count}`,
    ].join("\n");
  }

  return [
    `[Club] ${title}`,
    `Time: ${timeRange}`,
    `Place: ${location}`,
    `Team: ${team}`,
    `Credits: ${debit}`,
    `Signup: ${url}`,
    `Deadline: ${deadline}`,
    `Registered: ${count}`,
  ].join("\n");
}

export function buildTrilingualNotice(fields: SessionNoticeFields): string {
  return [
    "—— 繁中 ——",
    buildLocaleNotice("zh-Hant", fields),
    "",
    "—— English ——",
    buildLocaleNotice("en", fields),
    "",
    "—— 日本語 ——",
    buildLocaleNotice("ja", fields),
  ].join("\n");
}

export function sessionSignupUrl(
  origin: string,
  locale: NoticeLocale,
  sessionId: string,
): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/${locale}/app/sessions/${sessionId}`;
}
