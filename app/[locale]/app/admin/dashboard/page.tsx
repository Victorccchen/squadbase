import { getLocale, getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { OpsDashboardPanel } from "@/components/admin/ops-dashboard-panel";
import { PageHeader } from "@/components/page-header";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { emptyDashboardSnapshot, parseDashboardSearchParams } from "@/lib/org/dashboard";
import { loadOpsDashboard } from "@/lib/org/dashboard-queries";
import { listTeams } from "@/lib/org/queries";

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

  const [t, common, locale, params, ageSquads] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("common"),
    getLocale(),
    searchParams,
    listTeams({ kind: "age_squad" }),
  ]);
  const filters = parseDashboardSearchParams(params);
  const loaded = await loadOpsDashboard(filters);
  const snapshot = loaded.ok ? loaded.snapshot : emptyDashboardSnapshot(filters);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("title")} description={t("lead")} />
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
