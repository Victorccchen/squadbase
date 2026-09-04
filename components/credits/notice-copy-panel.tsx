"use client";

import { useTranslations } from "next-intl";
import { CopyTextButton } from "@/components/credits/copy-text-button";
import {
  buildLocaleNotice,
  buildTrilingualNotice,
  type SessionNoticeFields,
} from "@/lib/credits/notice";

type NoticeCopyPanelProps = {
  fields: SessionNoticeFields;
};

export function NoticeCopyPanel({ fields }: NoticeCopyPanelProps) {
  const t = useTranslations("credits");
  const zh = buildLocaleNotice("zh-Hant", fields);
  const en = buildLocaleNotice("en", fields);
  const ja = buildLocaleNotice("ja", fields);
  const all = buildTrilingualNotice(fields);

  const blocks = [
    { key: "zh" as const, text: zh },
    { key: "en" as const, text: en },
    { key: "ja" as const, text: ja },
    { key: "all" as const, text: all },
  ];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("noticeTitle")}
        </h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("noticeLead")}</p>
      </div>
      {blocks.map((block) => (
        <div key={block.key} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t(`noticeBlocks.${block.key}`)}</h3>
            <CopyTextButton
              text={block.text}
              label={t("copyNotice")}
              copiedLabel={t("copied")}
            />
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-zinc-100 px-4 py-3 text-xs leading-5 dark:bg-zinc-800">
            {block.text}
          </pre>
        </div>
      ))}
    </section>
  );
}
