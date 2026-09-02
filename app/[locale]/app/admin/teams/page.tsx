import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listTeams } from "@/lib/org/queries";
import { primaryButtonClassName } from "@/lib/ui";

export default async function AdminTeamsPage() {
  const t = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const teams = await listTeams();

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("teamsTitle")}
          description={t("teamsBody")}
          actions={
            <Link href="/app/admin/teams/new" className={primaryButtonClassName}>
              {t("createTeam")}
            </Link>
          }
        />
        {teams.length === 0 ? (
          <EmptyState title={t("teamsEmptyTitle")} body={t("teamsEmptyBody")} />
        ) : (
          <ul className="grid gap-3">
            {teams.map((team) => (
              <li key={team.id}>
                <Link
                  href={`/app/admin/teams/${team.id}`}
                  className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-semibold">{team.name}</span>
                  <span className="text-sm text-zinc-500">
                    {org(`ageBands.${team.age_band}`)} · {org(`status${team.status === "active" ? "Active" : "Inactive"}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
