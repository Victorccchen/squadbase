import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TeamLifecycleForms } from "@/components/admin/team-lifecycle-forms";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listTeamsForAdmin } from "@/lib/org/queries";
import { isAgeSquad, isCompetitionTeam } from "@/lib/org/squad-team";
import { setTeamStatus } from "@/lib/org/actions";
import { primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";
import type { TeamAdminRow } from "@/lib/org/queries";

function TeamList({
  teams,
  org,
  emptyTitle,
  emptyBody,
}: {
  teams: TeamAdminRow[];
  org: Awaited<ReturnType<typeof getTranslations>>;
  emptyTitle: string;
  emptyBody: string;
}) {
  if (teams.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }
  return (
    <ul className="grid gap-3">
      {teams.map((team) => (
        <li
          key={team.id}
          className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <Link href={`/app/admin/teams/${team.id}`} className="font-semibold hover:underline">
              {team.name}
            </Link>
            <span className="text-sm text-zinc-500">
              {org(team.kind === "age_squad" ? "kindAgeSquad" : "kindCompetitionTeam")}
              {team.kind === "competition_team" && team.layer_key ? ` · ${team.layer_key}` : ""}
              {" · "}
              {org(`ageBands.${team.age_band}`)} ·{" "}
              {org(`status${team.status === "active" ? "Active" : "Inactive"}`)}
            </span>
          </div>
          <TeamLifecycleForms
            teamId={team.id}
            teamName={team.name}
            status={team.status}
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
  );
}

export default async function AdminTeamsPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const teams = await listTeamsForAdmin();
  const squads = teams.filter((team) => isAgeSquad(team));
  const sides = teams.filter((team) => isCompetitionTeam(team));

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("teamsTitle")}
          description={t("teamsBody")}
          actions={
            <span className="flex flex-wrap gap-2">
              <Link href="/app/admin/teams/new?kind=age_squad" className={primaryButtonClassName}>
                {t("createAgeSquad")}
              </Link>
              <Link
                href="/app/admin/teams/new?kind=competition_team"
                className={secondaryButtonClassName}
              >
                {t("createCompetitionTeam")}
              </Link>
            </span>
          }
        />
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {org("ageSquads")}
          </h2>
          <TeamList
            teams={squads}
            org={org}
            emptyTitle={t("ageSquadsEmptyTitle")}
            emptyBody={t("ageSquadsEmptyBody")}
          />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {org("competitionTeams")}
          </h2>
          <TeamList
            teams={sides}
            org={org}
            emptyTitle={t("competitionTeamsEmptyTitle")}
            emptyBody={t("competitionTeamsEmptyBody")}
          />
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
