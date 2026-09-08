"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { MatchForm } from "@/components/admin/match-form";
import { createMatch } from "@/lib/org/match-actions";
import {
  assistMatchUrl,
  confirmOrgImport,
  INITIAL_IMPORT_CONFIRM_STATE,
  INITIAL_IMPORT_PREVIEW_STATE,
  INITIAL_URL_ASSIST_STATE,
  previewOrgImport,
} from "@/lib/org/import-actions";
import { IMPORT_KINDS, templateCsv, templateFilename, templateXlsx, type ImportKind } from "@/lib/org/import-templates";
import type { OrgErrorKey } from "@/lib/org/errors";

const IMPORT_ERROR_KEYS = new Set<OrgErrorKey>([
  "duplicatePlayer",
  "duplicateInFile",
  "unknownProfilePhone",
  "coachAlreadyLinked",
  "ambiguousTeamName",
  "importEmpty",
  "importTooLarge",
  "importInvalidFile",
  "importNoValidRows",
  "importHeaderInvalid",
  "blockedUrl",
  "urlFetchFailed",
  "urlTimeout",
  "missingProfile",
]);
import type { Team } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";

type AdminImportPanelProps = {
  teams: Pick<Team, "id" | "name" | "age_band" | "status">[];
};

function downloadBytes(filename: string, bytes: Uint8Array, type: string) {
  const copy = Uint8Array.from(bytes);
  const blob = new Blob([copy], { type });
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

export function AdminImportPanel({ teams }: AdminImportPanelProps) {
  const t = useTranslations("import");
  const [tab, setTab] = useState<ImportKind | "url">("players");

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label={t("tabsLabel")} className="flex flex-wrap gap-2">
        {IMPORT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={tabClass(tab === kind)}
            onClick={() => setTab(kind)}
          >
            {t(`tabs.${kind}`)}
          </button>
        ))}
        <button type="button" className={tabClass(tab === "url")} onClick={() => setTab("url")}>
          {t("tabs.url")}
        </button>
      </nav>
      {tab === "url" ? (
        <UrlAssistSection teams={teams} />
      ) : (
        <FileImportSection key={tab} kind={tab} />
      )}
    </div>
  );
}

function FileImportSection({ kind }: { kind: ImportKind }) {
  const t = useTranslations("import");
  const org = useTranslations("org");
  const [previewState, previewAction, previewPending] = useActionState(
    previewOrgImport,
    INITIAL_IMPORT_PREVIEW_STATE,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmOrgImport,
    INITIAL_IMPORT_CONFIRM_STATE,
  );

  const previewJson = useMemo(
    () => (previewState.preview ? JSON.stringify(previewState.preview) : ""),
    [previewState.preview],
  );

  function errorText(key: OrgErrorKey) {
    return IMPORT_ERROR_KEYS.has(key) ? t(`errors.${key}`) : org(`errors.${key}`);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButtonClassName}
          onClick={() =>
            downloadBytes(
              templateFilename(kind, "csv"),
              new TextEncoder().encode(templateCsv(kind)),
              "text/csv;charset=utf-8",
            )
          }
        >
          {t("downloadCsv")}
        </button>
        <button
          type="button"
          className={secondaryButtonClassName}
          onClick={() =>
            downloadBytes(
              templateFilename(kind, "xlsx"),
              templateXlsx(kind),
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
          }
        >
          {t("downloadXlsx")}
        </button>
      </div>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t(`leads.${kind}`)}</p>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("confirmHint")}</p>
      <form action={previewAction} className="flex max-w-xl flex-col gap-4">
        <LocaleHiddenField />
        <input type="hidden" name="kind" value={kind} />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("fileLabel")}
          <input name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className={inputClassName} />
        </label>
        {previewState.errorKey ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorText(previewState.errorKey)}
          </p>
        ) : null}
        <button type="submit" disabled={previewPending} className={primaryButtonClassName}>
          {previewPending ? t("previewing") : t("preview")}
        </button>
      </form>

      {previewState.preview ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {t("previewCounts", {
              valid: previewState.preview.validCount,
              invalid: previewState.preview.invalidCount,
            })}
          </p>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("line")}</th>
                  <th className="px-3 py-2 font-medium">{t("status")}</th>
                  <th className="px-3 py-2 font-medium">{t("summary")}</th>
                  <th className="px-3 py-2 font-medium">{t("reason")}</th>
                </tr>
              </thead>
              <tbody>
                {previewState.preview.rows.map((row) => (
                  <tr key={row.line} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2">{row.line}</td>
                    <td className="px-3 py-2">{row.valid ? t("valid") : t("invalid")}</td>
                    <td className="px-3 py-2">{row.summary}</td>
                    <td className="px-3 py-2">
                      {row.errorKeys.map((key) => errorText(key)).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={confirmAction} className="flex max-w-xl flex-col gap-3">
            <LocaleHiddenField />
            <input type="hidden" name="preview_json" value={previewJson} />
            {confirmState.errorKey ? (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                {errorText(confirmState.errorKey)}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={confirmPending || previewState.preview.validCount === 0}
              className={primaryButtonClassName}
            >
              {confirmPending ? t("importing") : t("confirm")}
            </button>
          </form>
        </div>
      ) : null}

      {confirmState.attempted ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p>
            {t("confirmCounts", {
              created: confirmState.created.length,
              failed: confirmState.failed.length,
            })}
          </p>
          {confirmState.failed.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1">
              {confirmState.failed.map((row) => (
                <li key={row.line}>
                  {t("failedLine", { line: row.line })}{" "}
                  {row.errorKeys.map((key) => errorText(key)).join(" · ")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function UrlAssistSection({
  teams,
}: {
  teams: Pick<Team, "id" | "name" | "age_band" | "status">[];
}) {
  const t = useTranslations("import");
  const org = useTranslations("org");
  const [state, action, pending] = useActionState(assistMatchUrl, INITIAL_URL_ASSIST_STATE);

  function errorText(key: OrgErrorKey) {
    return IMPORT_ERROR_KEYS.has(key) ? t(`errors.${key}`) : org(`errors.${key}`);
  }

  return (
    <section className="flex flex-col gap-6">
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("leads.url")}</p>
      <form action={action} className="flex max-w-xl flex-col gap-4">
        <LocaleHiddenField />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("urlLabel")}
          <input
            name="url"
            type="url"
            required
            placeholder="https://"
            className={inputClassName}
          />
        </label>
        {state.errorKey ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorText(state.errorKey)}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className={primaryButtonClassName}>
          {pending ? t("extracting") : t("extract")}
        </button>
      </form>
      {state.suggestions ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("suggestionsHint")}</p>
          <MatchForm
            key={state.sourceUrl ?? "url-draft"}
            action={createMatch}
            teams={teams}
            draft={state.suggestions}
            submitLabel={t("saveMatch")}
          />
        </div>
      ) : null}
    </section>
  );
}
