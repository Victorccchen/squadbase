import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SessionListFiltersForm } from "@/components/admin/session-list-filters";
import { SessionMonthCalendar } from "@/components/admin/session-month-calendar";
import { SessionDayAgenda } from "@/components/admin/session-day-agenda";
import { SessionViewToggle } from "@/components/admin/session-kind-legend";
import { SessionStatusForm } from "@/components/admin/session-status-form";
import {
  SessionDeletedBadge,
  SessionKindBadge,
  SessionPlayoffBadge,
  SessionStatusBadge,
} from "@/components/sessions/session-status-badge";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listTeams } from "@/lib/org/queries";
import { listSessionsForAdmin } from "@/lib/org/session-queries";
import { setSessionStatus } from "@/lib/org/session-actions";
import { formatClubDateTimeRange } from "@/lib/org/session-time";
import {
  adminSessionsHref,
  clubRangeToTimestamptz,
  clubTodayDate,
  parseAdminSessionsQuery,
  sessionsOnDate,
  visibleMonthRange,
} from "@/lib/org/session-calendar";
import { primaryButtonClassName } from "@/lib/ui";

type AdminSessionsPageProps = {
  searchParams: Promise<{
    month?: string | string[];
    day?: string | string[];
    view?: string | string[];
    kind?: string | string[];
    team?: string | string[];
    includeDeleted?: string | string[];
  }>;
};

export default async function AdminSessionsPage({ searchParams }: AdminSessionsPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const params = await searchParams;
  const query = parseAdminSessionsQuery(params);
  const range = visibleMonthRange(query.year, query.month);
  const bounds = range ? clubRangeToTimestamptz(range.from, range.to) : null;
  const today = clubTodayDate();

  const t = await getTranslations("admin");
  const sessionsT = await getTranslations("sessions");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const [sessions, teams] = await Promise.all([
    listSessionsForAdmin({
      kinds: query.kinds,
      teamIds: query.teamIds,
      includeDeleted: query.includeDeleted,
      startsFrom: bounds?.from,
      startsToExclusive: bounds?.toExclusive,
    }),
    listTeams(),
  ]);
  const daySessions = sessionsOnDate(sessions, query.day);
  const calendarHref = adminSessionsHref({ ...query, view: "calendar" });
  const listHref = adminSessionsHref({ ...query, view: "list" });
  const hasFilters = query.kinds.length > 0 || query.teamIds.length > 0 || query.includeDeleted;

  return (
    <>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("sessionsTitle")}
          description={t("sessionsBody")}
          actions={
            <span className="flex flex-wrap gap-2">
              <SessionViewToggle
                calendarHref={calendarHref}
                listHref={listHref}
                view={query.view}
                calendarLabel={t("calendarView")}
                listLabel={t("listView")}
              />
              <Link href="/app/admin/sessions/new" className={primaryButtonClassName}>
                {t("createSession")}
              </Link>
            </span>
          }
        />
        <SessionListFiltersForm query={query} teams={teams} />
        {query.view === "list" ? (
          sessions.length === 0 ? (
            <EmptyState
              title={hasFilters ? t("sessionsFilterEmptyTitle") : t("sessionsEmptyTitle")}
              body={hasFilters ? t("sessionsFilterEmptyBody") : t("sessionsEmptyBody")}
            />
          ) : (
            <ul className="grid gap-3">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <Link
                        href={`/app/admin/sessions/${session.id}`}
                        className="font-semibold hover:underline"
                      >
                        {session.title}
                      </Link>
                      <p className="text-sm text-zinc-500">
                        {session.team?.name ?? org("unknownTeam")}
                        {" · "}
                        {formatClubDateTimeRange(session.starts_at, session.ends_at, locale)}
                      </p>
                      {session.location ? (
                        <p className="text-sm text-zinc-500">{session.location}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SessionKindBadge kind={session.kind} label={sessionsT(`kinds.${session.kind}`)} />
                      {session.is_playoff ? <SessionPlayoffBadge label={sessionsT("playoff")} /> : null}
                      {session.deleted_at ? (
                        <SessionDeletedBadge label={t("sessionDeleted")} />
                      ) : (
                        <SessionStatusBadge
                          status={session.status}
                          label={org(session.status === "active" ? "statusActive" : "statusInactive")}
                        />
                      )}
                      <span className="text-sm text-zinc-500">
                        {t("rosterCount", { count: session.registeredCount })}
                      </span>
                    </div>
                  </div>
                  {session.deleted_at ? null : (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/app/admin/sessions/${session.id}/edit`}
                        className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        {t("edit")}
                      </Link>
                      <SessionStatusForm
                        status={session.status}
                        action={setSessionStatus.bind(null, session.id)}
                        redirectTo="list"
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <SessionMonthCalendar query={query} sessions={sessions} today={today} />
            </div>
            <div className="min-w-0 flex-1 lg:max-w-md">
              <SessionDayAgenda date={query.day} sessions={daySessions} />
            </div>
          </div>
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
