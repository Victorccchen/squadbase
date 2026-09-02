import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PlayerForm } from "@/components/admin/player-form";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { createPlayer } from "@/lib/org/actions";
import { listTeams } from "@/lib/org/queries";
import { primaryButtonClassName } from "@/lib/ui";

export default async function NewPlayerPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("admin");
  const common = await getTranslations("common");
  const teams = await listTeams();

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("createPlayer")} description={t("playersBody")} />
        {teams.length === 0 ? (
          <>
            <EmptyState title={t("playersNeedTeamTitle")} body={t("playersNeedTeamBody")} />
            <p>
              <Link href="/app/admin/teams/new" className={primaryButtonClassName}>
                {t("createTeam")}
              </Link>
            </p>
          </>
        ) : (
          <PlayerForm action={createPlayer} teams={teams} submitLabel={t("createPlayer")} />
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
