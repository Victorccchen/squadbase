import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TeamLifecycleForms } from "@/components/admin/team-lifecycle-forms";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listTeamsForAdmin } from "@/lib/org/queries";
import { setTeamStatus } from "@/lib/org/actions";
import { teamHasNoDeleteBlockers } from "@/lib/org/parse";
import { primaryButtonClassName } from "@/lib/ui";

export default async function AdminTeamsPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const teams = await listTeamsForAdmin();

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
              <li
                key={team.id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    href={`/app/admin/teams/${team.id}`}
                    className="font-semibold hover:underline"
                  >
                    {team.name}
                  </Link>
                  <span className="text-sm text-zinc-500">
                    {org(`ageBands.${team.age_band}`)} ·{" "}
                    {org(`status${team.status === "active" ? "Active" : "Inactive"}`)}
                  </span>
                </div>
                <TeamLifecycleForms
                  teamId={team.id}
                  teamName={team.name}
                  status={team.status}
                  canDelete={teamHasNoDeleteBlockers(
                    team.membershipCount,
                    team.coachAssignmentCount,
                  )}
                  membershipCount={team.membershipCount}
                  activeMembershipCount={team.activeMembershipCount}
                  coachAssignmentCount={team.coachAssignmentCount}
                  setStatusAction={setTeamStatus.bind(null, team.id)}
                  variant="inline"
                  redirectTo="list"
                  editHref={`/app/admin/teams/${team.id}/edit`}
                />
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
