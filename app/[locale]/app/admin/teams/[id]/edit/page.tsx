import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { TeamForm } from "@/components/admin/team-form";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { updateTeam } from "@/lib/org/actions";
import { getTeam } from "@/lib/org/queries";

type EditTeamPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditTeamPage({ params }: EditTeamPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const { id } = await params;
  const team = await getTeam(id);
  if (!team) {
    notFound();
  }

  const t = await getTranslations("admin");
  const common = await getTranslations("common");
  const action = updateTeam.bind(null, team.id);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("editTeam")} description={team.name} />
        <TeamForm action={action} team={team} submitLabel={t("save")} />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
