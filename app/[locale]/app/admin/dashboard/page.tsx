import { getLocale, getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { OpsDashboardPanel } from "@/components/admin/ops-dashboard-panel";
import { PageHeader } from "@/components/page-header";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { emptyDashboardSnapshot, parseDashboardSearchParams } from "@/lib/org/dashboard";
import { loadOpsDashboard } from "@/lib/org/dashboard-queries";
import { listTeams } from "@/lib/org/queries";
import { Link } from "@/i18n/navigation";
import { migrationProgress } from "@/lib/credits/paper-card";
import { loadPaperCardStats } from "@/lib/credits/paper-card-queries";
import { clubTodayDate } from "@/lib/org/session-calendar";

type AdminDashboardPageProps = {
  searchParams: Promise<{
    from?: string | string[];
    to?: string | string[];
    squad?: string | string[];
  }>;
};

export default async function AdminOpsDashboardPage({ searchParams }: AdminDashboardPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const [t, paperT, common, locale, params, ageSquads, paperStats] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("paperCards"),
    getTranslations("common"),
    getLocale(),
    searchParams,
    listTeams({ kind: "age_squad" }),
    loadPaperCardStats(clubTodayDate()),
  ]);
  const paperShare = migrationProgress(paperStats.movedPlayers, paperStats.rosterPlayers);
  const filters = parseDashboardSearchParams(params);
  const loaded = await loadOpsDashboard(filters);
  const snapshot = loaded.ok ? loaded.snapshot : emptyDashboardSnapshot(filters);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("title")} description={t("lead")} />
        {/* PR-09 (D7): parallel season progress. */}
        <Link
          href="/app/admin/paper-cards"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span className="font-medium">{paperT("dashboardTitle")}</span>
          <span>
            {paperT("progress", { moved: paperStats.movedPlayers, roster: paperStats.rosterPlayers })}
            {paperShare !== null ? ` (${Math.round(paperShare * 100)}%)` : ""}
            {" · "}
            {paperT("seasonChecks", { checks: paperStats.seasonChecks, mismatches: paperStats.seasonMismatches })}
          </span>
        </Link>
        <OpsDashboardPanel
          snapshot={snapshot}
          ageSquads={ageSquads}
          locale={locale}
          loadError={!loaded.ok}
        />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
