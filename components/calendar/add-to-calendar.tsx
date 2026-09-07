"use client";

import { useTranslations } from "next-intl";
import {
  buildIcs,
  googleCalendarUrl,
  icsFilename,
  outlookCalendarUrl,
  type CalendarEventPayload,
} from "@/lib/org/calendar-export";
import { quietButtonClassName } from "@/lib/ui";

type AddToCalendarProps = {
  event: CalendarEventPayload;
};

export function AddToCalendar({ event }: AddToCalendarProps) {
  const t = useTranslations("calendar");
  const google = googleCalendarUrl(event);
  const outlook = outlookCalendarUrl(event);

  function downloadIcs() {
    const ics = buildIcs(event);
    if (!ics) {
      return;
    }
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = icsFilename(event.title);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("add")}</p>
      <div className="flex flex-wrap gap-1">
        {google ? (
          <a
            href={google}
            target="_blank"
            rel="noopener noreferrer"
            className={quietButtonClassName}
          >
            {t("google")}
          </a>
        ) : null}
        <button type="button" onClick={downloadIcs} className={quietButtonClassName}>
          {t("apple")}
        </button>
        {outlook ? (
          <a
            href={outlook}
            target="_blank"
            rel="noopener noreferrer"
            className={quietButtonClassName}
          >
            {t("outlook")}
          </a>
        ) : null}
        <button type="button" onClick={downloadIcs} className={quietButtonClassName}>
          {t("ics")}
        </button>
      </div>
    </div>
  );
}
