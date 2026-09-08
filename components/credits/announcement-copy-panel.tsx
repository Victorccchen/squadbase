"use client";

import { CopyTextButton } from "@/components/credits/copy-text-button";
import type { AnnouncementPaste } from "@/lib/credits/notice-templates";
import { NOTICE_COPY_LOCALES, type NoticeLocale } from "@/lib/credits/notice-templates";
import { secondaryButtonClassName } from "@/lib/ui";

type AnnouncementCopyPanelProps = {
  pastes: AnnouncementPaste[];
  copyLocale: NoticeLocale;
  onCopyLocaleChange: (locale: NoticeLocale) => void;
  localeLabel: (locale: NoticeLocale) => string;
  copyLabel: string;
  copiedLabel: string;
  copyLocaleLabel: string;
  pasteForGroup: (band: string) => string;
  dualPasteHint: string | null;
  previewTitle: string;
};

export function AnnouncementCopyPanel({
  pastes,
  copyLocale,
  onCopyLocaleChange,
  localeLabel,
  copyLabel,
  copiedLabel,
  copyLocaleLabel,
  pasteForGroup,
  dualPasteHint,
  previewTitle,
}: AnnouncementCopyPanelProps) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {previewTitle}
        </h2>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={copyLocaleLabel}>
          {NOTICE_COPY_LOCALES.map((code) => {
            const active = code === copyLocale;
            return (
              <button
                key={code}
                type="button"
                onClick={() => onCopyLocaleChange(code)}
                aria-pressed={active}
                className={
                  active
                    ? "rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : secondaryButtonClassName
                }
              >
                {localeLabel(code)}
              </button>
            );
          })}
        </div>
      </div>
      {dualPasteHint ? (
        <p className="text-sm leading-6 text-amber-900 dark:text-amber-100">{dualPasteHint}</p>
      ) : null}
      {pastes.map((paste, index) => (
        <div key={`${paste.groupBand ?? "single"}-${index}`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              {paste.groupBand ? pasteForGroup(paste.groupBand) : previewTitle}
            </h3>
            <CopyTextButton text={paste.text} label={copyLabel} copiedLabel={copiedLabel} />
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-zinc-100 px-4 py-3 text-xs leading-5 dark:bg-zinc-800">
            {paste.text}
          </pre>
        </div>
      ))}
    </section>
  );
}
