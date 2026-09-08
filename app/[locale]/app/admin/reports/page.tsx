import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { AdminReportsPanel } from "@/components/admin/admin-reports-panel";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listTeams } from "@/lib/org/queries";
import { isReportType, type ReportType } from "@/lib/org/reports";
import { parseUuid } from "@/lib/org/parse";

type AdminReportsPageProps = {
  searchParams: Promise<{
    type?: string | string[];
    session?: string | string[];
  }>;
};

function firstQuery(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function AdminReportsPage({ searchParams }: AdminReportsPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("admin");
  const common = await getTranslations("common");
  const params = await searchParams;
  const typeRaw = firstQuery(params.type);
  const initialType: ReportType = isReportType(typeRaw) ? typeRaw : "attendance";
  const sessionRaw = firstQuery(params.session);
  const initialSessionId = parseUuid(sessionRaw) ?? "";
  const [ageSquads, competitionTeams] = await Promise.all([
    listTeams({ kind: "age_squad" }),
    listTeams({ kind: "competition_team" }),
  ]);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("reportsTitle")} description={t("reportsBody")} />
        <AdminReportsPanel
          ageSquads={ageSquads}
          competitionTeams={competitionTeams}
          initialType={initialType}
          initialSessionId={initialSessionId}
        />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
