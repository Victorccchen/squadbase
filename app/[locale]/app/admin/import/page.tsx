import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { AdminImportPanel } from "@/components/admin/admin-import-panel";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listTeams } from "@/lib/org/queries";

export default async function AdminImportPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("admin");
  const common = await getTranslations("common");
  const teams = await listTeams({ kind: "competition_team" });

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("importTitle")} description={t("importBody")} />
        <AdminImportPanel teams={teams} />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
