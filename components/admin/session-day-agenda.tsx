import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import {
  SessionDeletedBadge,
  SessionKindBadge,
  SessionPlayoffBadge,
  SessionStatusBadge,
} from "@/components/sessions/session-status-badge";
import { groupSessionsByClubDate } from "@/lib/org/session-calendar";
import { formatClubDate, formatClubTime } from "@/lib/org/session-time";
import type { TrainingSessionAdminRow } from "@/lib/org/session-queries";

type SessionWeekAgendaProps = {
  selectedDate: string;
  weekFrom: string;
  weekTo: string;
  sessions: TrainingSessionAdminRow[];
  prevHref: {
    pathname: "/app/admin/sessions";
    query: Record<string, string | string[]>;
  };
  nextHref: {
    pathname: "/app/admin/sessions";
    query: Record<string, string | string[]>;
  };
};

export async function SessionDayAgenda({
  selectedDate,
  weekFrom,
  weekTo,
  sessions,
  prevHref,
  nextHref,
}: SessionWeekAgendaProps) {
  const t = await getTranslations("admin");
  const sessionsT = await getTranslations("sessions");
  const org = await getTranslations("org");
  const locale = await getLocale();
  const days = groupSessionsByClubDate(sessions);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={prevHref}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {t("prevWeek")}
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t("thisWeek")}
          </p>
          <h2 className="text-base font-semibold leading-snug sm:text-lg">
            {t("weekRange", {
              from: formatClubDate(weekFrom, locale),
              to: formatClubDate(weekTo, locale),
            })}
          </h2>
        </div>
        <Link
          href={nextHref}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {t("nextWeek")}
        </Link>
      </div>
      {sessions.length === 0 ? (
        <EmptyState title={t("calendarEmptyWeekTitle")} body={t("calendarEmptyWeekBody")} />
      ) : (
        <div className="flex flex-col gap-5">
          {days.map((group) => {
            const selected = group.date === selectedDate;
            return (
              <div
                key={group.date}
                className={`flex flex-col gap-2 rounded-xl p-1 ${
                  selected ? "bg-zinc-100 dark:bg-zinc-800" : ""
                }`}
              >
                <h3
                  className={`text-sm font-semibold tracking-wide ${
                    selected ? "text-foreground" : "uppercase text-zinc-500"
                  }`}
                >
                  {formatClubDate(group.date, locale)}
                </h3>
                <ul className="grid gap-2">
                  {group.sessions.map((session) => (
                    <li
                      key={session.id}
                      className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link
                          href={`/app/admin/sessions/${session.id}`}
                          className="font-semibold hover:underline"
                        >
                          {session.title}
                        </Link>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <SessionKindBadge
                            kind={session.kind}
                            label={sessionsT(`kinds.${session.kind}`)}
                          />
                          {session.is_playoff ? (
                            <SessionPlayoffBadge label={sessionsT("playoff")} />
                          ) : null}
                          {session.deleted_at ? (
                            <SessionDeletedBadge label={t("sessionDeleted")} />
                          ) : (
                            <SessionStatusBadge
                              status={session.status}
                              label={org(session.status === "active" ? "statusActive" : "statusInactive")}
                            />
                          )}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500">
                        {session.team?.name ?? org("unknownTeam")}
                        {" · "}
                        {formatClubTime(session.starts_at, locale)}
                        {" – "}
                        {formatClubTime(session.ends_at, locale)}
                        {session.location ? ` · ${session.location}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}