import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PlayerForm } from "@/components/admin/player-form";
import { createPlayer } from "@/lib/org/actions";
import { listTeams } from "@/lib/org/queries";

export default async function NewPlayerPage() {
  const t = await getTranslations("admin");
  const common = await getTranslations("common");
  const teams = await listTeams();

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("createPlayer")} description={t("playersBody")} />
        <PlayerForm action={createPlayer} teams={teams} submitLabel={t("createPlayer")} />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
