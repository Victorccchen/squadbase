import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { PlayerForm } from "@/components/admin/player-form";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { updatePlayer } from "@/lib/org/actions";
import { getPlayer, listTeams } from "@/lib/org/queries";

type EditPlayerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPlayerPage({ params }: EditPlayerPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const { id } = await params;
  const [player, teams] = await Promise.all([getPlayer(id), listTeams()]);
  if (!player) {
    notFound();
  }

  const t = await getTranslations("admin");
  const common = await getTranslations("common");
  const action = updatePlayer.bind(null, player.id);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("editPlayer")} />
        <PlayerForm
          action={action}
          player={player}
          membership={player.membership}
          teams={teams}
          submitLabel={t("save")}
        />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
