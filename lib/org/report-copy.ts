/**
 * Locale copy for Stage R CSV/XLSX headers and enum labels.
 * Reads the same message files as the admin UI so Excel headers match the UI locale.
 */

import en from "../../messages/en.json" with { type: "json" };
import ja from "../../messages/ja.json" with { type: "json" };
import zhHant from "../../messages/zh-Hant.json" with { type: "json" };
import type { ReportCopy } from "./reports.ts";

const BUNDLES = {
  "zh-Hant": zhHant,
  en,
  ja,
} as const;

type MessageBundle = typeof en;

export function reportCopyForLocale(locale: string): ReportCopy {
  const bundle: MessageBundle =
    locale === "en" ? BUNDLES.en : locale === "ja" ? BUNDLES.ja : BUNDLES["zh-Hant"];
  return {
    columns: bundle.reports.columns,
    kinds: bundle.sessions.kinds,
    attendance: bundle.credits.attendance,
    attendanceUnmarked: bundle.credits.attendanceUnmarked,
    registrationStatus: bundle.sessions.statuses,
    ledgerTypes: bundle.reports.ledgerTypes,
    actorRoles: bundle.app.roles,
    actorUnknown: bundle.reports.actorUnknown,
    publicStatus: bundle.matches.statuses,
    published: bundle.matches.published,
    unpublished: bundle.matches.unpublished,
    yes: bundle.reports.yes,
    no: bundle.reports.no,
    opponentTbd: bundle.matches.opponentTbd,
  };
}
