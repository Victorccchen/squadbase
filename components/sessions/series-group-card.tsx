import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import {
  SessionKindBadge,
  SessionPlayoffBadge,
} from "@/components/sessions/session-status-badge";
import type { SessionKind } from "@/lib/supabase/database.types";
import { formatClubDateWithWeekday } from "@/lib/org/session-time";

type SeriesGroupCardProps = {
  href: string;
  title: string;
  teamName: string;
  kind: SessionKind;
  isPlayoff?: boolean;
  nextStartsAt: string;
  occurrenceCount: number;
  locale: string;
};

export async function SeriesGroupCard({
  href,
  title,
  teamName,
  kind,
  isPlayoff = false,
  nextStartsAt,
  occurrenceCount,
  locale,
}: SeriesGroupCardProps) {
  const sessionsT = await getTranslations("sessions");
  const t = await getTranslations("competitions");

  return (
    <li>
      <Link
        href={href}
        className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{title}</span>
          <span className="flex flex-wrap items-center gap-2">
            <SessionKindBadge kind={kind} label={sessionsT(`kinds.${kind}`)} />
            {isPlayoff ? <SessionPlayoffBadge label={sessionsT("playoff")} /> : null}
          </span>
        </div>
        <p className="text-sm text-zinc-500">
          {teamName}
          {" · "}
          {t("nextOccurrence")}: {formatClubDateWithWeekday(nextStartsAt, locale)}
          {" · "}
          {t("occurrenceCount", { count: occurrenceCount })}
        </p>
        <span className="text-sm font-medium underline underline-offset-2">{t("viewSeries")}</span>
      </Link>
    </li>
  );
}
