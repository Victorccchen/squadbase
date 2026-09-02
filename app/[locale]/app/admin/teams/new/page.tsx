import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { TeamForm } from "@/components/admin/team-form";
import { createTeam } from "@/lib/org/actions";

export default async function NewTeamPage() {
  const t = await getTranslations("admin");
  const common = await getTranslations("common");

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("createTeam")} description={t("teamsBody")} />
        <TeamForm action={createTeam} submitLabel={t("createTeam")} />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
