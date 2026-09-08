import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { AvailableSessionCard } from "@/components/sessions/available-session-card";
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
import { listOwnGuardianLinks } from "@/lib/org/queries";
import {
  approvedChildrenFromLinks,
  childrenOnSessionTeam,
  listOpenTrainingSessionsForParent,
  listOwnSessionRegistrations,
  openRegistrationForPlayer,
} from "@/lib/org/session-queries";
import {
  groupTrainingSessionsForParent,
  isTrainingSessionKind,
  parentGroupPath,
  parentOccurrencePath,
} from "@/lib/org/parent-series";
import { TRAINING_SESSION_KINDS } from "@/lib/org/session-recurrence";
import { localizedPlayerName } from "@/lib/org/display-name";
import { formatParentVisibleDateTimeRange } from "@/lib/org/session-time";
import {
  calendarWeekNavHrefs,
  clubTodayDate,
  parseAdminSessionsQuery,
  sessionsInWeek,
  weekRangeForDate,
} from "@/lib/org/session-calendar";

type ParentSessionsPageProps = {
  searchParams: Promise<{
    registered?: string | string[];
    month?: string | string[];
    day?: string | string[];
    view?: string | string[];
  }>;
};

export default async function ParentSessionsPage({ searchParams }: ParentSessionsPageProps) {
  const t = await getTranslations("sessions");
  const admin = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const params = await searchParams;
  const query = parseAdminSessionsQuery(params, undefined, {
    allowedKinds: TRAINING_SESSION_KINDS,
    defaultView: "list",
  });
  const registeredRaw = Array.isArray(params.registered)
    ? (params.registered[0] ?? "")
    : (params.registered ?? "");
  const showRegistered = registeredRaw === "1";
  const links = await listOwnGuardianLinks();
  const children = approvedChildrenFromLinks(links);
  const teamIds = [...new Set(children.map((child) => child.teamId))];
  const playerIds = [...new Set(children.map((child) => child.player.id))];
  const [sessions, registrations] = await Promise.all([
    listOpenTrainingSessionsForParent(teamIds),
    listOwnSessionRegistrations(playerIds),
  ]);
  const groups = groupTrainingSessionsForParent(sessions);
  const openRegistrations = registrations.filter(
    (row) => row.status === "registered" && row.session && isTrainingSessionKind(row.session.kind),
  );
  const week = weekRangeForDate(query.day);
  const weekSessions = sessionsInWeek(sessions, query.day);
  const today = clubTodayDate();
  const { calendarHref, listHref, prevWeekHref, nextWeekHref } = calendarWeekNavHrefs(
    "/app/sessions",
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
            {t("registerSuccess")}
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
                  pathname="/app/sessions"
                  legendKinds={TRAINING_SESSION_KINDS}
                />
              </div>
              <div className="min-w-0 flex-1 lg:max-w-md">
                <SessionDayAgenda
                  selectedDate={query.day}
                  weekFrom={week?.from ?? query.day}
                  weekTo={week?.to ?? query.day}
                  sessions={weekSessions}
                  occurrenceHref={(id) => `/app/sessions/${id}`}
                  prevHref={prevWeekHref}
                  nextHref={nextWeekHref}
                />
              </div>
            </div>
          ) : groups.length === 0 ? (
            <EmptyState title={t("emptyUpcomingTitle")} body={t("emptyUpcomingBody")} />
          ) : (
            <ul className="grid gap-3">
              {groups.map((group) => {
                if (group.groupKind === "training-series") {
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
                }
                const session = group.sessions[0];
                if (!session) {
                  return null;
                }
                return (
                  <AvailableSessionCard
                    key={session.id}
                    sessionId={session.id}
                    title={session.title}
                    teamName={session.team?.name ?? org("unknownTeam")}
                    location={session.location}
                    startsAt={session.starts_at}
                    endsAt={session.ends_at}
                    kind={session.kind}
                    isPlayoff={session.is_playoff}
                    locale={locale}
                    returnTo="sessions"
                    childrenOnTeam={childrenOnSessionTeam(children, session.team_id).map((child) => ({
                      playerId: child.player.id,
                      playerName: localizedPlayerName(child.player, locale),
                      registrationId:
                        openRegistrationForPlayer(registrations, session.id, child.player.id)?.id ??
                        null,
                    }))}
                  />
                );
              })}
            </ul>
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
                          label={t(`statuses.${row.status}`)}
                        />
                        {row.session ? (
                          <SessionKindBadge
                            kind={row.session.kind}
                            label={t(`kinds.${row.session.kind}`)}
                          />
                        ) : null}
                        {row.session?.is_playoff ? (
                          <SessionPlayoffBadge label={t("playoff")} />
                        ) : null}
                        <span className="font-medium">
                          {row.player ? localizedPlayerName(row.player, locale) : t("unknownPlayer")}
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
                      {row.parent_note ? (
                        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                          {t("parentNote")}: {row.parent_note}
                        </p>
                      ) : null}
                      {row.session ? (
                        <Link
                          href={parentOccurrencePath(row.session)}
                          className="text-sm font-medium underline underline-offset-2"
                        >
                          {t("viewSession")}
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
                          returnTo="sessions"
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
