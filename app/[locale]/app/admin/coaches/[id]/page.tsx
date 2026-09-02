import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { CoachTeamsForm } from "@/components/admin/coach-teams-form";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { getCoach, listTeams } from "@/lib/org/queries";

type CoachDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CoachDetailPage({ params }: CoachDetailPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const { id } = await params;
  const [coach, teams] = await Promise.all([getCoach(id), listTeams()]);
  if (!coach) {
    notFound();
  }

  const t = await getTranslations("admin");
  const common = await getTranslations("common");
  const title = coach.profile?.display_name || coach.profile?.phone || coach.profile_id;

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={title} description={t("coachesBody")} />
        <CoachTeamsForm coach={coach} assignments={coach.assignments} teams={teams} />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
