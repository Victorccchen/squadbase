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
import { listMatchesForAdmin, probeMatchesForAdmin } from "@/lib/org/match-queries";
import { MATCH_KINDS, formatMatchScore, publicOpponentLabel } from "@/lib/org/match";
import {
  adminGroupHref,
  groupMatchSessionsForParent,
  nextOccurrenceInGroup,
} from "@/lib/org/parent-series";
import { SeriesGroupCard } from "@/components/sessions/series-group-card";
import { ListWindowNav } from "@/components/sessions/list-window-nav";
import { formatClubDateTime } from "@/lib/org/session-time";
import {
  calendarWeekNavHrefs,
  clubTodayDate,
  parseAdminSessionsQuery,
  parseListDateWindow,
  resolveSurfaceKinds,
  sessionsInWeek,
  sessionsListOrCalendarBounds,
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
    from?: string | string[];
    to?: string | string[];
  }>;
};

export default async function AdminMatchesPage({ searchParams }: AdminMatchesPageProps) {
  const [allowed, params] = await Promise.all([canRenderAdminPage(), searchParams]);
  if (!allowed) {
    return <AccessDenied area="admin" />;
  }

  const query = parseAdminSessionsQuery(params, undefined, {
    allowedKinds: MATCH_KINDS,
    defaultView: "list",
  });
  const kinds = resolveSurfaceKinds(query.kinds, MATCH_KINDS);
  const listWindow = parseListDateWindow(params);
  const bounds = sessionsListOrCalendarBounds(query, listWindow);
  const week = weekRangeForDate(query.day);
  const today = clubTodayDate();
  const startsFrom = bounds.from;
  const startsToExclusive = bounds.toExclusive;

  const [t, matchesT, org, common, locale, matches, teams, probe] = await Promise.all([
    getTranslations("admin"),
    getTranslations("matches"),
    getTranslations("org"),
    getTranslations("common"),
    getLocale(),
    listMatchesForAdmin({
      kinds,
      teamIds: query.teamIds,
      startsFrom,
      startsToExclusive,
    }),
    listTeams({ kind: "competition_team" }),
    query.view === "list"
      ? probeMatchesForAdmin({
          kinds,
          teamIds: query.teamIds,
          startsFrom,
          startsToExclusive,
        })
      : Promise.resolve({ hasEarlier: false, hasLater: false }),
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
          listWindow={listWindow}
        />
        {query.view === "list" ? (
          <div className="flex flex-col gap-4">
            <ListWindowNav
              pathname="/app/admin/matches"
              query={query}
              window={listWindow}
              hasEarlier={probe.hasEarlier}
              hasLater={probe.hasLater}
            />
            {groups.length === 0 ? (
            <EmptyState
              title={
                probe.hasEarlier || probe.hasLater
                  ? t("listWindowEmptyTitle")
                  : hasFilters
                    ? t("sessionsFilterEmptyTitle")
                    : t("matchesEmptyTitle")
              }
              body={
                probe.hasEarlier || probe.hasLater
                  ? t("listWindowEmptyBody")
                  : hasFilters
                    ? t("sessionsFilterEmptyBody")
                    : t("matchesEmptyBody")
              }
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
                const registeredSum = group.sessions.reduce(
                  (sum, row) => sum + row.registeredCount,
                  0,
                );
                const rosterSum = group.sessions.reduce((sum, row) => sum + row.rosterCount, 0);
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
                  t("rosterCount", { count: registeredSum }),
                  matchesT("rosterCount", { count: rosterSum }),
                  next?.deleted_at ? t("sessionDeleted") : null,
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
          )}
          </div>
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
