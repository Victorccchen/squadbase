"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { exportAdminReport } from "@/lib/org/report-actions";
import {
  MATCH_REPORT_KINDS,
  REPORT_TYPES,
  defaultReportDateRange,
  type ReportType,
} from "@/lib/org/reports";
import { SESSION_KINDS } from "@/lib/org/session-recurrence";
import type { OrgErrorKey } from "@/lib/org/errors";
import type { Team } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";

const REPORT_ERROR_KEYS = new Set<OrgErrorKey>([
  "forbidden",
  "notConfigured",
  "invalidReportType",
  "invalidReportFormat",
  "reportInvalidDateRange",
  "reportTooManyRows",
  "sessionNotFound",
  "generic",
]);

type AdminReportsPanelProps = {
  ageSquads: Pick<Team, "id" | "name">[];
  competitionTeams: Pick<Team, "id" | "name">[];
  initialType?: ReportType;
  initialSessionId?: string;
};

function downloadBase64(filename: string, mime: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function tabClass(active: boolean) {
  return active
    ? "rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
    : "rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";
}

export function AdminReportsPanel({
  ageSquads,
  competitionTeams,
  initialType = "attendance",
  initialSessionId = "",
}: AdminReportsPanelProps) {
  const t = useTranslations("reports");
  const org = useTranslations("org");
  const sessionsT = useTranslations("sessions");
  const adminT = useTranslations("admin");
  const [reportType, setReportType] = useState<ReportType>(initialType);
  const [errorKey, setErrorKey] = useState<OrgErrorKey | null>(null);
  const [pending, startTransition] = useTransition();
  const defaults = defaultReportDateRange();
  const kinds = reportType === "match_roster" ? MATCH_REPORT_KINDS : SESSION_KINDS;

  function errorText(key: OrgErrorKey) {
    return REPORT_ERROR_KEYS.has(key) ? org(`errors.${key}`) : org("errors.generic");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name === "format") {
      const existing = form.querySelector('input[data-format-override="1"]');
      existing?.remove();
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "format";
      hidden.value = submitter.value;
      hidden.dataset.formatOverride = "1";
      form.appendChild(hidden);
    }
    const formData = new FormData(form);
    setErrorKey(null);
    startTransition(async () => {
      const result = await exportAdminReport(formData);
      if (!result.ok || !result.filename || !result.mime || !result.base64) {
        setErrorKey(result.errorKey ?? "generic");
        return;
      }
      downloadBase64(result.filename, result.mime, result.base64);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label={t("tabsLabel")} className="flex flex-wrap gap-2">
        {REPORT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={tabClass(reportType === type)}
            onClick={() => setReportType(type)}
          >
            {t(`types.${type}`)}
          </button>
        ))}
      </nav>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t(`typeHint.${reportType}`)}</p>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("privacyHint")}</p>
      <form className="flex flex-col gap-6" onSubmit={onSubmit}>
        <LocaleHiddenField />
        <input type="hidden" name="reportType" value={reportType} />
        {initialSessionId ? <input type="hidden" name="sessionId" value={initialSessionId} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("dateFrom")}
            <input
              className={inputClassName}
              type="date"
              name="dateFrom"
              defaultValue={initialSessionId ? "" : defaults.from}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("dateTo")}
            <input
              className={inputClassName}
              type="date"
              name="dateTo"
              defaultValue={initialSessionId ? "" : defaults.to}
            />
          </label>
        </div>
        <p className="text-xs text-zinc-500">{t("dateHint")}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{sessionsT("kind")}</legend>
          <div className="flex flex-wrap gap-3">
            {kinds.map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="kind" value={value} />
                {sessionsT(`kinds.${value}`)}
              </label>
            ))}
          </div>
          <p className="text-xs text-zinc-500">{t("kindsHint")}</p>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{org("kindAgeSquad")}</legend>
          {ageSquads.length === 0 ? (
            <p className="text-sm text-zinc-500">{adminT("filterNoTeams")}</p>
          ) : (
            <div className="flex max-h-40 flex-col flex-wrap gap-2 overflow-auto sm:max-h-none sm:flex-row">
              {ageSquads.map((team) => (
                <label key={team.id} className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="ageSquad" value={team.id} />
                  {team.name}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-zinc-500">{t("ageSquadHint")}</p>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{org("kindCompetitionTeam")}</legend>
          {competitionTeams.length === 0 ? (
            <p className="text-sm text-zinc-500">{adminT("filterNoTeams")}</p>
          ) : (
            <div className="flex max-h-40 flex-col flex-wrap gap-2 overflow-auto sm:max-h-none sm:flex-row">
              {competitionTeams.map((team) => (
                <label key={team.id} className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="competitionTeam" value={team.id} />
                  {team.name}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-zinc-500">{t("competitionTeamHint")}</p>
        </fieldset>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="includeDeleted" value="1" />
          {t("includeDeleted")}
        </label>
        {errorKey ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
            {errorText(errorKey)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="format"
            value="csv"
            className={primaryButtonClassName}
            disabled={pending}
          >
            {pending ? t("downloading") : t("formatCsv")}
          </button>
          <button
            type="submit"
            name="format"
            value="xlsx"
            className={secondaryButtonClassName}
            disabled={pending}
          >
            {pending ? t("downloading") : t("formatXlsx")}
          </button>
        </div>
      </form>
    </div>
  );
}
