"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { exportAdminReport } from "@/lib/org/report-actions";
import type { ReportFormat, ReportType } from "@/lib/org/reports";
import type { OrgErrorKey } from "@/lib/org/errors";
import { secondaryButtonClassName } from "@/lib/ui";

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

type ReportExportButtonsProps = {
  reportType: ReportType;
  sessionId: string;
  label: string;
};

export function ReportExportButtons({ reportType, sessionId, label }: ReportExportButtonsProps) {
  const t = useTranslations("reports");
  const org = useTranslations("org");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<OrgErrorKey | null>(null);

  function exportFormat(format: ReportFormat) {
    const formData = new FormData();
    formData.set("reportType", reportType);
    formData.set("format", format);
    formData.set("sessionId", sessionId);
    formData.set("locale", locale);
    formData.set("includeDeleted", "1");
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
    <span className="flex flex-col gap-2">
      <span className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButtonClassName}
          disabled={pending}
          onClick={() => exportFormat("csv")}
        >
          {pending ? t("downloading") : `${label} · CSV`}
        </button>
        <button
          type="button"
          className={secondaryButtonClassName}
          disabled={pending}
          onClick={() => exportFormat("xlsx")}
        >
          {pending ? t("downloading") : `${label} · Excel`}
        </button>
      </span>
      {errorKey ? (
        <span className="text-sm text-red-800 dark:text-red-200">{org(`errors.${errorKey}`)}</span>
      ) : null}
    </span>
  );
}
