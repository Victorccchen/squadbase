import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SessionForm } from "@/components/admin/session-form";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listTeams } from "@/lib/org/queries";
import { createSession } from "@/lib/org/session-actions";

export default async function NewSessionPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("admin");
  const common = await getTranslations("common");
  const teams = await listTeams();

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("createSession")} description={t("sessionsBody")} />
        {teams.length === 0 ? (
          <EmptyState title={t("playersNeedTeamTitle")} body={t("playersNeedTeamBody")} />
        ) : (
          <SessionForm action={createSession} teams={teams} submitLabel={t("createSession")} />
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}