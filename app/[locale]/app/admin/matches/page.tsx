import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SessionListFiltersForm } from "@/components/admin/session-list-filters";
import { SessionMonthCalendar } from "@/components/admin/session-month-calendar";
import { SessionDayAgenda } from "@/components/admin/session-day-agenda";
import { SessionViewToggle } from "@/components/admin/session-kind-legend";
import { SessionKindBadge, SessionPlayoffBadge } from "@/components/sessions/session-status-badge";
import { MatchSideBadge, MatchStatusBadge } from "@/components/matches/match-status-badge";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listTeams } from "@/lib/org/queries";
import { listMatchesForAdmin } from "@/lib/org/match-queries";
import { MATCH_KINDS, formatMatchScore, publicOpponentLabel } from "@/lib/org/match";
import { formatClubDateTime } from "@/lib/org/session-time";
import {
  calendarWeekNavHrefs,
  clubRangeToTimestamptz,
  clubTodayDate,
  parseAdminSessionsQuery,
  resolveSurfaceKinds,
  sessionsInWeek,
  visibleMonthRange,
  weekRangeForDate,
} from "@/lib/org/session-calendar";
import { primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";

type AdminMatchesPageProps = {
  searchParams: Promise<{
    month?: string | string[];
    day?: string | string[];
    view?: string | string[];
    kind?: string | string[];
    team?: string | string[];
  }>;
};

export default async function AdminMatchesPage({ searchParams }: AdminMatchesPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const params = await searchParams;
  const query = parseAdminSessionsQuery(params, undefined, {
    allowedKinds: MATCH_KINDS,
  });
  const kinds = resolveSurfaceKinds(query.kinds, MATCH_KINDS);
  const range = visibleMonthRange(query.year, query.month);
  const week = weekRangeForDate(query.day);
  const fromDate =
    range && week && week.from < range.from ? week.from : (range?.from ?? query.day);
  const toDate = range && week && week.to > range.to ? week.to : (range?.to ?? query.day);
  const bounds =
    query.view === "calendar"
      ? clubRangeToTimestamptz(fromDate, toDate)
      : range
        ? clubRangeToTimestamptz(range.from, range.to)
        : null;
  const today = clubTodayDate();

  const t = await getTranslations("admin");
  const matchesT = await getTranslations("matches");
  const sessionsT = await getTranslations("sessions");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const [matches, teams] = await Promise.all([
    listMatchesForAdmin({
      kinds,
      teamIds: query.teamIds,
      startsFrom: bounds?.from,
      startsToExclusive: bounds?.toExclusive,
    }),
    listTeams(),
  ]);
  const weekSessions = sessionsInWeek(matches, query.day);
  const { calendarHref, listHref, prevWeekHref, nextWeekHref } = calendarWeekNavHrefs(
    "/app/admin/matches",
    query,
  );
  const hasFilters = query.kinds.length > 0 || query.teamIds.length > 0;

  return (
    <>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("matchesTitle")}
          description={t("matchesBody")}
          actions={
            <span className="flex flex-wrap gap-2">
              <SessionViewToggle
                calendarHref={calendarHref}
                listHref={listHref}
                view={query.view}
                calendarLabel={t("calendarView")}
                listLabel={t("listView")}
              />
              <Link href="/app/admin/matches/new" className={primaryButtonClassName}>
                {t("createMatch")}
              </Link>
              <Link href="/app/admin/matches/bulk" className={secondaryButtonClassName}>
                {t("bulkCreateMatch")}
              </Link>
            </span>
          }
        />
        <SessionListFiltersForm
          query={query}
          teams={teams}
          kinds={MATCH_KINDS}
          showIncludeDeleted={false}
        />
        {query.view === "list" ? (
          matches.length === 0 ? (
            <EmptyState
              title={hasFilters ? t("sessionsFilterEmptyTitle") : t("matchesEmptyTitle")}
              body={hasFilters ? t("sessionsFilterEmptyBody") : t("matchesEmptyBody")}
            />
          ) : (
            <ul className="grid gap-3">
              {matches.map((row) => {
                const score = formatMatchScore(
                  row.publication.club_score,
                  row.publication.opponent_score,
                );
                return (
                  <li key={row.id}>
                    <Link
                      href={`/app/admin/matches/${row.id}`}
                      className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <SessionKindBadge kind={row.kind} label={sessionsT(`kinds.${row.kind}`)} />
                        {row.is_playoff ? (
                          <SessionPlayoffBadge label={sessionsT("playoff")} />
                        ) : null}
                        <MatchStatusBadge
                          status={row.publication.public_status}
                          label={matchesT(`statuses.${row.publication.public_status}`)}
                        />
                        <MatchSideBadge label={matchesT(`sides.${row.publication.side}`)} />
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                          {row.publication.is_published
                            ? matchesT("published")
                            : matchesT("unpublished")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <h2 className="text-base font-semibold">{row.title}</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-300">
                          {row.team?.name ?? org("unknownTeam")} {matchesT("versus")}{" "}
                          {publicOpponentLabel(row.publication.opponent, matchesT("opponentTbd"))}
                        </p>
                      </div>
                      <p className="text-sm text-zinc-500">
                        {formatClubDateTime(row.starts_at, locale)}
                        {score ? ` · ${score}` : ""}
                        {` · ${matchesT("rosterCount", { count: row.rosterCount })}`}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <SessionMonthCalendar
                query={query}
                sessions={matches}
                today={today}
                pathname="/app/admin/matches"
                legendKinds={MATCH_KINDS}
              />
            </div>
            <div className="min-w-0 flex-1 lg:max-w-md">
              <SessionDayAgenda
                selectedDate={query.day}
                weekFrom={week?.from ?? query.day}
                weekTo={week?.to ?? query.day}
                sessions={weekSessions}
                occurrenceHref={(id) => `/app/admin/matches/${id}`}
                prevHref={prevWeekHref}
                nextHref={nextWeekHref}
              />
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
