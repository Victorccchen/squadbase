import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SessionKindBadge, SessionPlayoffBadge } from "@/components/sessions/session-status-badge";
import { MatchSideBadge, MatchStatusBadge } from "@/components/matches/match-status-badge";
import { getAuthUser } from "@/lib/auth/session";
import { getPublishedMatch, listPublishedMatchRoster } from "@/lib/org/match-queries";
import { formatMatchScore } from "@/lib/org/match";
import { localizedPlayerName } from "@/lib/org/display-name";
import { formatClubDateTimeRange } from "@/lib/org/session-time";
import { secondaryButtonClassName } from "@/lib/ui";

export const dynamic = "force-dynamic";

type PublicMatchDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PublicMatchDetailPage({ params }: PublicMatchDetailPageProps) {
  const { id } = await params;
  const match = await getPublishedMatch(id);
  if (!match) {
    notFound();
  }

  const t = await getTranslations("matches");
  const sessionsT = await getTranslations("sessions");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const user = await getAuthUser();
  const roster = await listPublishedMatchRoster(match.id);
  const score = formatMatchScore(match.club_score, match.opponent_score);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <SiteHeader signedIn={Boolean(user)} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={match.title}
          description={`${match.team_name} · ${formatClubDateTimeRange(match.starts_at, match.ends_at, locale)}`}
          actions={
            <Link href="/matches" className={secondaryButtonClassName}>
              {t("backToSchedule")}
            </Link>
          }
        />
        <div className="flex flex-wrap gap-2">
          <SessionKindBadge kind={match.kind} label={sessionsT(`kinds.${match.kind}`)} />
          {match.is_playoff ? <SessionPlayoffBadge label={sessionsT("playoff")} /> : null}
          <MatchStatusBadge
            status={match.public_status}
            label={t(`statuses.${match.public_status}`)}
          />
          <MatchSideBadge label={t(`sides.${match.side}`)} />
        </div>
        <dl className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{t("team")}</dt>
            <dd className="font-medium">{match.team_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{t("opponent")}</dt>
            <dd className="font-medium">{match.opponent}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{t("kickoff")}</dt>
            <dd className="font-medium">
              {formatClubDateTimeRange(match.starts_at, match.ends_at, locale)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{t("venue")}</dt>
            <dd className="font-medium">{match.location || "—"}</dd>
          </div>
          {score ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{t("score")}</dt>
              <dd className="font-medium">{score}</dd>
            </div>
          ) : null}
          {match.result_note ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{t("resultNote")}</dt>
              <dd className="text-right">{match.result_note}</dd>
            </div>
          ) : null}
        </dl>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("lineupTitle")}
          </h2>
          {roster.length === 0 ? (
            <EmptyState title={t("lineupEmptyTitle")} body={t("lineupEmptyBody")} />
          ) : (
            <ul className="grid gap-2">
              {roster.map((row) => (
                <li
                  key={row.player_id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="font-medium">{localizedPlayerName(row, locale)}</span>
                  <span className="tabular-nums text-zinc-500">#{row.jersey_number}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </div>
  );
}
