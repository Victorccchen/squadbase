import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { TeamForm } from "@/components/admin/team-form";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { createTeam } from "@/lib/org/actions";
import { isTeamKind } from "@/lib/org/squad-team";

type NewTeamPageProps = {
  searchParams: Promise<{ kind?: string | string[] }>;
};

export default async function NewTeamPage({ searchParams }: NewTeamPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const params = await searchParams;
  const raw = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const defaultKind = raw && isTeamKind(raw) ? raw : "age_squad";

  const t = await getTranslations("admin");
  const common = await getTranslations("common");
  const title = defaultKind === "competition_team" ? t("createCompetitionTeam") : t("createAgeSquad");

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={title} description={t("teamsBody")} />
        <TeamForm
          action={createTeam}
          defaultKind={defaultKind}
          submitLabel={title}
        />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
