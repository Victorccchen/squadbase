import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { CoachLinkForm } from "@/components/admin/coach-link-form";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { linkCoach } from "@/lib/org/actions";
import { listCoaches, listLinkableProfiles } from "@/lib/org/queries";

export default async function NewCoachPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const coaches = await listCoaches();
  const profiles = await listLinkableProfiles(coaches.map((coach) => coach.profile_id));

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("linkCoach")} description={org("linkCoachHint")} />
        <CoachLinkForm action={linkCoach} profiles={profiles} />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
