import { getLocale, getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PublicMatchCard } from "@/components/matches/public-match-card";
import { getAuthUser } from "@/lib/auth/session";
import { listPartitionedPublishedMatches } from "@/lib/org/match-queries";

export const dynamic = "force-dynamic";

export default async function PublicMatchesPage() {
  const t = await getTranslations("matches");
  const sessionsT = await getTranslations("sessions");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const user = await getAuthUser();
  const { upcoming, recentPast } = await listPartitionedPublishedMatches();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <SiteHeader signedIn={Boolean(user)} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-12">
        <PageHeader title={t("title")} description={t("lead")} />
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("upcomingTitle")}
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState title={t("upcomingEmptyTitle")} body={t("upcomingEmptyBody")} />
          ) : (
            <ul className="grid gap-3">
              {upcoming.map((match) => (
                <li key={match.id}>
                  <PublicMatchCard
                    match={match}
                    locale={locale}
                    kindLabel={sessionsT(`kinds.${match.kind}`)}
                    playoffLabel={sessionsT("playoff")}
                    statusLabel={t(`statuses.${match.public_status}`)}
                    sideLabel={t(`sides.${match.side}`)}
                    vsLabel={t("versus")}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("recentTitle")}
          </h2>
          {recentPast.length === 0 ? (
            <EmptyState title={t("recentEmptyTitle")} body={t("recentEmptyBody")} />
          ) : (
            <ul className="grid gap-3">
              {recentPast.map((match) => (
                <li key={match.id}>
                  <PublicMatchCard
                    match={match}
                    locale={locale}
                    kindLabel={sessionsT(`kinds.${match.kind}`)}
                    playoffLabel={sessionsT("playoff")}
                    statusLabel={t(`statuses.${match.public_status}`)}
                    sideLabel={t(`sides.${match.side}`)}
                    vsLabel={t("versus")}
                  />
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
