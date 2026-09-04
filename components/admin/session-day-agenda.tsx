import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import {
  SessionDeletedBadge,
  SessionKindBadge,
  SessionPlayoffBadge,
  SessionStatusBadge,
} from "@/components/sessions/session-status-badge";
import { groupSessionsByTeam } from "@/lib/org/session-calendar";
import { formatClubDate, formatClubTime } from "@/lib/org/session-time";
import type { TrainingSessionAdminRow } from "@/lib/org/session-queries";

type SessionDayAgendaProps = {
  date: string;
  sessions: TrainingSessionAdminRow[];
};

export async function SessionDayAgenda({ date, sessions }: SessionDayAgendaProps) {
  const t = await getTranslations("admin");
  const sessionsT = await getTranslations("sessions");
  const org = await getTranslations("org");
  const locale = await getLocale();
  const groups = groupSessionsByTeam(sessions);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">{formatClubDate(date, locale)}</h2>
      {sessions.length === 0 ? (
        <EmptyState title={t("calendarEmptyDayTitle")} body={t("calendarEmptyDayBody")} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.teamId ?? "ungrouped"} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {group.teamName ?? org("unknownTeam")}
                {" · "}
                {group.groupKey === "ungrouped"
                  ? t("groupUngrouped")
                  : group.groupKey === "senior"
                    ? t("groupAdult")
                    : org(`ageBands.${group.groupKey}`)}
              </h3>
              <ul className="grid gap-2">
                {group.sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
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
                      {formatClubTime(session.starts_at, locale)}
                      {" – "}
                      {formatClubTime(session.ends_at, locale)}
                      {session.location ? ` · ${session.location}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
