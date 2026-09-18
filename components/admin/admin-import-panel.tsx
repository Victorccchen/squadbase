"use client";

import { useActionState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import type { OrgErrorKey } from "@/lib/org/errors";
import { parseTorneopalPreviewJson, type TorneopalPreviewStatus } from "@/lib/org/torneopal-preview";
import {
  confirmTorneopalSchedule,
  previewTorneopalSchedule,
} from "@/lib/org/torneopal-actions";
import {
  INITIAL_TORNEOPAL_CONFIRM_STATE,
  INITIAL_TORNEOPAL_PREVIEW_STATE,
} from "@/lib/org/torneopal-state";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

export function AdminImportPanel() {
  const t = useTranslations("torneopal");
  const org = useTranslations("org");
  const [previewState, previewAction, previewPending] = useActionState(
    previewTorneopalSchedule,
    INITIAL_TORNEOPAL_PREVIEW_STATE,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmTorneopalSchedule,
    INITIAL_TORNEOPAL_CONFIRM_STATE,
  );

  const preview = useMemo(() => {
    if (!previewState.previewJson) {
      return null;
    }
    return parseTorneopalPreviewJson(previewState.previewJson);
  }, [previewState.previewJson]);

  function errorText(key: OrgErrorKey) {
    try {
      return t(`errors.${key}`);
    } catch {
      try {
        return org(`errors.${key}`);
      } catch {
        return key;
      }
    }
  }

  function statusLabel(status: TorneopalPreviewStatus) {
    switch (status) {
      case "create":
        return t("statusCreate");
      case "skip":
        return t("statusSkip");
      case "error":
        return t("statusError");
      default: {
        const exhaustive: never = status;
        return exhaustive;
      }
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("lead")}</p>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("confirmHint")}</p>
      <form action={previewAction} className="flex max-w-xl flex-col gap-4">
        <LocaleHiddenField />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("urlLabel")}
          <input
            name="url"
            type="url"
            required
            placeholder={t("urlPlaceholder")}
            className={inputClassName}
          />
        </label>
        {previewState.attempted && previewState.errorKey ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorText(previewState.errorKey)}
          </p>
        ) : null}
        <button type="submit" disabled={previewPending} className={primaryButtonClassName}>
          {previewPending ? t("previewing") : t("preview")}
        </button>
      </form>

      {preview ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {t("sourcePage", { title: preview.pageTitle || preview.sourceUrl })}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("unpublishedHint")}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {t("previewCounts", {
              create: preview.createCount,
              skip: preview.skipCount,
              error: preview.errorCount,
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
                {preview.rows.map((row) => (
                  <tr key={row.line} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2">{row.line}</td>
                    <td className="px-3 py-2">{statusLabel(row.status)}</td>
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
            <input type="hidden" name="preview_json" value={previewState.previewJson ?? ""} />
            {confirmState.attempted && confirmState.errorKey ? (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                {errorText(confirmState.errorKey)}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={confirmPending || preview.createCount === 0}
              className={primaryButtonClassName}
            >
              {confirmPending ? t("confirming") : t("confirm")}
            </button>
          </form>
        </div>
      ) : null}

      {confirmState.attempted ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p>
            {t("confirmCounts", {
              created: confirmState.created.length,
              skipped: confirmState.skipped.length,
              failed: confirmState.failed.length,
            })}
          </p>
          {confirmState.skipped.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1">
              {confirmState.skipped.map((row) => (
                <li key={`skip-${row.line}`}>
                  {t("skippedLine", { line: row.line })}{" "}
                  {row.errorKeys.map((key) => errorText(key)).join(" · ")}
                </li>
              ))}
            </ul>
          ) : null}
          {confirmState.failed.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1">
              {confirmState.failed.map((row) => (
                <li key={`fail-${row.line}`}>
                  {t("failedLine", { line: row.line })}{" "}
                  {row.errorKeys.map((key) => errorText(key)).join(" · ")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
