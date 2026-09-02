import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listCoaches } from "@/lib/org/queries";
import { primaryButtonClassName } from "@/lib/ui";

export default async function AdminCoachesPage() {
  const t = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const coaches = await listCoaches();

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("coachesTitle")}
          description={t("coachesBody")}
          actions={
            <Link href="/app/admin/coaches/new" className={primaryButtonClassName}>
              {t("linkCoach")}
            </Link>
          }
        />
        {coaches.length === 0 ? (
          <EmptyState title={t("coachesEmptyTitle")} body={t("coachesEmptyBody")} />
        ) : (
          <ul className="grid gap-3">
            {coaches.map((coach) => (
              <li key={coach.id}>
                <Link
                  href={`/app/admin/coaches/${coach.id}`}
                  className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="font-semibold">
                    {coach.profile?.display_name || coach.profile?.phone || coach.profile_id}
                  </span>
                  <span className="text-sm text-zinc-500">
                    {org(coach.status === "active" ? "statusActive" : "statusInactive")}
                    {" · "}
                    {coach.assignments.length > 0
                      ? coach.assignments
                          .map((item) => item.team?.name)
                          .filter(Boolean)
                          .join(" · ")
                      : org("noAssignedTeams")}
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
