import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SessionKindBadge, SessionPlayoffBadge } from "@/components/sessions/session-status-badge";
import { MatchSideBadge, MatchStatusBadge } from "@/components/matches/match-status-badge";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listMatchesForAdmin } from "@/lib/org/match-queries";
import { formatMatchScore } from "@/lib/org/match";
import { formatClubDateTime } from "@/lib/org/session-time";
import { primaryButtonClassName } from "@/lib/ui";

export default async function AdminMatchesPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("admin");
  const matchesT = await getTranslations("matches");
  const sessionsT = await getTranslations("sessions");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const matches = await listMatchesForAdmin();

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("matchesTitle")}
          description={t("matchesBody")}
          actions={
            <Link href="/app/admin/matches/new" className={primaryButtonClassName}>
              {t("createMatch")}
            </Link>
          }
        />
        {matches.length === 0 ? (
          <EmptyState title={t("matchesEmptyTitle")} body={t("matchesEmptyBody")} />
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
                        {row.publication.opponent}
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
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
