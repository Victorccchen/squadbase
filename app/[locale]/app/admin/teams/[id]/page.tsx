import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { TeamLifecycleForms } from "@/components/admin/team-lifecycle-forms";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { getTeam, listTeamPlayers, countCoachAssignmentsForTeam } from "@/lib/org/queries";
import { setTeamStatus } from "@/lib/org/actions";
import { localizedPlayerName } from "@/lib/org/display-name";
import { ageBandFromBirthDate } from "@/lib/age-band";
import { teamHasNoDeleteBlockers } from "@/lib/org/parse";
import { secondaryButtonClassName } from "@/lib/ui";

type TeamDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TeamDetailPage({ params }: TeamDetailPageProps) {
  // Return before getTeam / listTeamPlayers so non-admins never query org tables.
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const { id } = await params;
  const team = await getTeam(id);
  if (!team) {
    notFound();
  }

  const t = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const [members, coachAssignmentCount] = await Promise.all([
    listTeamPlayers(team.id),
    countCoachAssignmentsForTeam(team.id),
  ]);
  const membershipCount = members.length;
  const activeMembershipCount = members.filter(
    (row) => row.membership.status === "active",
  ).length;
  const canDelete = teamHasNoDeleteBlockers(membershipCount, coachAssignmentCount);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={team.name}
          actions={
            <span className="flex flex-wrap gap-2">
              <Link href="/app/admin/players/new" className={secondaryButtonClassName}>
                {t("createPlayer")}
              </Link>
              <Link href={`/app/admin/teams/${team.id}/edit`} className={secondaryButtonClassName}>
                {t("edit")}
              </Link>
            </span>
          }
        />
        <dl className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("ageBand")}</dt>
            <dd className="font-medium">{org(`ageBands.${team.age_band}`)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("status")}</dt>
            <dd className="font-medium">
              {org(team.status === "active" ? "statusActive" : "statusInactive")}
            </dd>
          </div>
        </dl>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("teamRosterTitle")}
          </h2>
          {members.length === 0 ? (
            <EmptyState
              title={t("teamRosterEmptyTitle")}
              body={t("teamRosterEmptyBody")}
            />
          ) : (
            <ul className="grid gap-2">
              {members.map((row) => {
                const band = ageBandFromBirthDate(row.player.birth_date);
                return (
                  <li key={row.membership.id}>
                    <Link
                      href={`/app/admin/players/${row.player.id}`}
                      className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white px-5 py-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="font-medium">
                        #{row.membership.jersey_number} {localizedPlayerName(row.player, locale)}
                      </span>
                      <span className="text-sm text-zinc-500">
                        {band ? org(`ageBands.${band}`) : org("ageBandUnknown")}
                        {" · "}
                        {org(row.player.status === "active" ? "statusActive" : "statusInactive")}
                        {row.membership.status === "inactive"
                          ? ` · ${org("membershipInactive")}`
                          : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <TeamLifecycleForms
          teamId={team.id}
          teamName={team.name}
          status={team.status}
          canDelete={canDelete}
          membershipCount={membershipCount}
          activeMembershipCount={activeMembershipCount}
          coachAssignmentCount={coachAssignmentCount}
          setStatusAction={setTeamStatus.bind(null, team.id)}
        />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
