import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SeriesGroupCard } from "@/components/sessions/series-group-card";
import { SessionListActions } from "@/components/sessions/session-list-actions";
import { SessionMonthCalendar } from "@/components/admin/session-month-calendar";
import { SessionDayAgenda } from "@/components/admin/session-day-agenda";
import { SessionViewToggle } from "@/components/admin/session-kind-legend";
import {
  RegistrationStatusBadge,
  SessionKindBadge,
  SessionPlayoffBadge,
} from "@/components/sessions/session-status-badge";
import { ListWindowNav } from "@/components/sessions/list-window-nav";
import { listOwnGuardianLinks } from "@/lib/org/queries";
import {
  approvedChildrenFromLinks,
  listOpenCompetitionSessionsForParent,
  listOwnSessionRegistrations,
  probeOpenSessionsForParent,
} from "@/lib/org/session-queries";
import {
  COMPETITION_SESSION_KINDS,
  groupMatchSessionsForParent,
  isCompetitionSessionKind,
  parentGroupPath,
  parentOccurrencePath,
} from "@/lib/org/parent-series";
import { localizedPlayerName } from "@/lib/org/display-name";
import { formatParentVisibleDateTimeRange } from "@/lib/org/session-time";
import {
  calendarWeekNavHrefs,
  clubTodayDate,
  parseAdminSessionsQuery,
  parseListDateWindow,
  sessionsInWeek,
  sessionsListOrCalendarBounds,
  weekRangeForDate,
} from "@/lib/org/session-calendar";

type ParentCompetitionsPageProps = {
  searchParams: Promise<{
    registered?: string | string[];
    month?: string | string[];
    day?: string | string[];
    view?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
};

export default async function ParentCompetitionsPage({
  searchParams,
}: ParentCompetitionsPageProps) {
  const [t, sessionsT, admin, org, common, locale, params, links] = await Promise.all([
    getTranslations("competitions"),
    getTranslations("sessions"),
    getTranslations("admin"),
    getTranslations("org"),
    getTranslations("common"),
    getLocale(),
    searchParams,
    listOwnGuardianLinks(),
  ]);
  const query = parseAdminSessionsQuery(params, undefined, {
    allowedKinds: COMPETITION_SESSION_KINDS,
    defaultView: "list",
  });
  const listWindow = parseListDateWindow(params);
  const bounds = sessionsListOrCalendarBounds(query, listWindow);
  const registeredRaw = Array.isArray(params.registered)
    ? (params.registered[0] ?? "")
    : (params.registered ?? "");
  const showRegistered = registeredRaw === "1";
  const children = approvedChildrenFromLinks(links, "competition_team");
  const teamIds = [...new Set(children.map((child) => child.teamId))];
  const playerIds = [...new Set(children.map((child) => child.player.id))];
  const startsWindow = {
    startsFrom: bounds.from,
    startsToExclusive: bounds.toExclusive,
  };
  const [sessions, registrations, probe] = await Promise.all([
    listOpenCompetitionSessionsForParent(teamIds, startsWindow),
    listOwnSessionRegistrations(playerIds),
    query.view === "list"
      ? probeOpenSessionsForParent(teamIds, COMPETITION_SESSION_KINDS, startsWindow)
      : Promise.resolve({ hasEarlier: false, hasLater: false }),
  ]);
  const groups = groupMatchSessionsForParent(sessions);
  const openRegistrations = registrations.filter(
    (row) =>
      row.status === "registered" && row.session && isCompetitionSessionKind(row.session.kind),
  );
  const week = weekRangeForDate(query.day);
  const weekSessions = sessionsInWeek(sessions, query.day);
  const today = clubTodayDate();
  const { calendarHref, listHref, prevWeekHref, nextWeekHref } = calendarWeekNavHrefs(
    "/app/competitions",
    query,
  );

  return (
    <>
      <main
        className={`mx-auto flex w-full flex-1 flex-col gap-10 px-6 py-12 ${
          query.view === "calendar" ? "max-w-6xl" : "max-w-3xl"
        }`}
      >
        <PageHeader title={t("title")} description={t("lead")} />
        <SessionViewToggle
          calendarHref={calendarHref}
          listHref={listHref}
          view={query.view}
          calendarLabel={admin("calendarView")}
          listLabel={admin("listView")}
          toggleLabel={admin("viewToggleLabel")}
        />

        {showRegistered ? (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          >
            {sessionsT("registerSuccess")}
          </p>
        ) : null}

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("upcomingTitle")}
          </h2>
          {children.length === 0 ? (
            <EmptyState title={t("emptyUpcomingTitle")} body={t("needApprovedChild")} />
          ) : query.view === "calendar" ? (
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                <SessionMonthCalendar
                  query={query}
                  sessions={sessions}
                  today={today}
                  pathname="/app/competitions"
                  legendKinds={COMPETITION_SESSION_KINDS}
                />
              </div>
              <div className="min-w-0 flex-1 lg:max-w-md">
                <SessionDayAgenda
                  selectedDate={query.day}
                  weekFrom={week?.from ?? query.day}
                  weekTo={week?.to ?? query.day}
                  sessions={weekSessions}
                  occurrenceHref={(id) => `/app/competitions/${id}`}
                  prevHref={prevWeekHref}
                  nextHref={nextWeekHref}
                />
              </div>
            </div>
          ) : (
            <>
              <ListWindowNav
                pathname="/app/competitions"
                query={query}
                window={listWindow}
                hasEarlier={probe.hasEarlier}
                hasLater={probe.hasLater}
              />
              {groups.length === 0 ? (
                <EmptyState
                  title={
                    probe.hasEarlier || probe.hasLater
                      ? admin("listWindowEmptyTitle")
                      : t("emptyUpcomingTitle")
                  }
                  body={
                    probe.hasEarlier || probe.hasLater
                      ? admin("listWindowEmptyBody")
                      : t("emptyUpcomingBody")
                  }
                />
              ) : (
            <ul className="grid gap-3">
              {groups.map((group) => {
                const next = group.sessions[0];
                return (
                  <SeriesGroupCard
                    key={group.key}
                    href={parentGroupPath(group)}
                    title={group.title}
                    teamName={next?.team?.name ?? org("unknownTeam")}
                    kind={group.sessionKind}
                    isPlayoff={group.sessions.some((row) => row.is_playoff)}
                    nextStartsAt={next?.starts_at ?? ""}
                    occurrenceCount={group.sessions.length}
                    locale={locale}
                  />
                );
              })}
            </ul>
              )}
            </>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("myRegistrations")}
          </h2>
          {openRegistrations.length === 0 ? (
            <EmptyState title={t("emptyRegistrationsTitle")} body={t("emptyRegistrationsBody")} />
          ) : (
            <ul className="grid gap-3">
              {openRegistrations.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <RegistrationStatusBadge
                          status={row.status}
                          label={sessionsT(`statuses.${row.status}`)}
                        />
                        {row.session ? (
                          <SessionKindBadge
                            kind={row.session.kind}
                            label={sessionsT(`kinds.${row.session.kind}`)}
                          />
                        ) : null}
                        {row.session?.is_playoff ? (
                          <SessionPlayoffBadge label={sessionsT("playoff")} />
                        ) : null}
                        <span className="font-medium">
                          {row.player
                            ? localizedPlayerName(row.player, locale)
                            : sessionsT("unknownPlayer")}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500">
                        {row.session?.title ?? org("unknownTeam")}
                        {" · "}
                        {row.session?.team?.name ?? org("unknownTeam")}
                        {" · "}
                        {row.session
                          ? formatParentVisibleDateTimeRange(
                              row.session.starts_at,
                              row.session.ends_at,
                              locale,
                            )
                          : ""}
                      </p>
                      {row.session ? (
                        <Link
                          href={parentOccurrencePath(row.session)}
                          className="text-sm font-medium underline underline-offset-2"
                        >
                          {t("viewMatch")}
                        </Link>
                      ) : null}
                    </div>
                    {row.session ? (
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <SessionListActions
                          sessionId={row.session.id}
                          playerId={row.player_id}
                          startsAt={row.session.starts_at}
                          registrationId={row.id}
                          showRegisteredLabel={false}
                          returnTo="competitions"
                        />
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
