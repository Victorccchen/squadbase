import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SessionListFiltersForm } from "@/components/admin/session-list-filters";
import { SessionMonthCalendar } from "@/components/admin/session-month-calendar";
import { SessionDayAgenda } from "@/components/admin/session-day-agenda";
import { SessionViewToggle } from "@/components/admin/session-kind-legend";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listTeams } from "@/lib/org/queries";
import { listMatchesForAdmin } from "@/lib/org/match-queries";
import { MATCH_KINDS, formatMatchScore, publicOpponentLabel } from "@/lib/org/match";
import {
  adminGroupHref,
  groupMatchSessionsForParent,
  nextOccurrenceInGroup,
} from "@/lib/org/parent-series";
import { SeriesGroupCard } from "@/components/sessions/series-group-card";
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
    defaultView: "list",
  });
  const kinds = resolveSurfaceKinds(query.kinds, MATCH_KINDS);
  const range = visibleMonthRange(query.year, query.month);
  const week = weekRangeForDate(query.day);
  const fromDate =
    range && week && week.from < range.from ? week.from : (range?.from ?? query.day);
  const toDate = range && week && week.to > range.to ? week.to : (range?.to ?? query.day);
  const bounds =
    query.view === "calendar" ? clubRangeToTimestamptz(fromDate, toDate) : null;
  const today = clubTodayDate();

  const t = await getTranslations("admin");
  const matchesT = await getTranslations("matches");
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
  const groups = groupMatchSessionsForParent(matches);
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
              <Link href="/app/admin/matches/new" className={primaryButtonClassName}>
                {t("createMatch")}
              </Link>
              <Link href="/app/admin/matches/bulk" className={secondaryButtonClassName}>
                {t("bulkCreateMatch")}
              </Link>
            </span>
          }
        />
        <SessionViewToggle
          calendarHref={calendarHref}
          listHref={listHref}
          view={query.view}
          calendarLabel={t("calendarView")}
          listLabel={t("listView")}
          toggleLabel={t("viewToggleLabel")}
        />
        <SessionListFiltersForm
          query={query}
          teams={teams}
          kinds={MATCH_KINDS}
          showIncludeDeleted={false}
        />
        {query.view === "list" ? (
          groups.length === 0 ? (
            <EmptyState
              title={hasFilters ? t("sessionsFilterEmptyTitle") : t("matchesEmptyTitle")}
              body={hasFilters ? t("sessionsFilterEmptyBody") : t("matchesEmptyBody")}
            />
          ) : (
            <ul className="grid gap-3">
              {groups.map((group) => {
                const next = nextOccurrenceInGroup(group.sessions);
                const score = next
                  ? formatMatchScore(
                      next.publication.club_score,
                      next.publication.opponent_score,
                    )
                  : null;
                const detailParts = [
                  next
                    ? `${next.team?.name ?? org("unknownTeam")} ${matchesT("versus")} ${publicOpponentLabel(next.publication.opponent, matchesT("opponentTbd"))}`
                    : null,
                  next
                    ? next.publication.is_published
                      ? matchesT("published")
                      : matchesT("unpublished")
                    : null,
                  score,
                  next ? formatClubDateTime(next.starts_at, locale) : null,
                ].filter((part): part is string => Boolean(part));
                return (
                  <SeriesGroupCard
                    key={group.key}
                    href={adminGroupHref(group)}
                    title={group.title}
                    teamName={next?.team?.name ?? org("unknownTeam")}
                    kind={group.sessionKind}
                    isPlayoff={group.sessions.some((row) => row.is_playoff)}
                    nextStartsAt={next?.starts_at ?? ""}
                    occurrenceCount={group.sessions.length}
                    locale={locale}
                    detail={detailParts.join(" · ")}
                    viewLabel={t("edit")}
                  />
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
