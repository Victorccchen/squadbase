import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { SessionForm } from "@/components/admin/session-form";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listTeams } from "@/lib/org/queries";
import { getSession } from "@/lib/org/session-queries";
import { updateSession } from "@/lib/org/session-actions";
import { isMatchKind } from "@/lib/org/match";
import { redirect } from "@/i18n/navigation";

type EditSessionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditSessionPage({ params }: EditSessionPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    notFound();
  }
  if (isMatchKind(session.kind)) {
    redirect({ href: `/app/admin/matches/${session.id}`, locale: await getLocale() });
  }

  const t = await getTranslations("admin");
  const common = await getTranslations("common");
  const teams = await listTeams({ kind: "age_squad" });
  const action = updateSession.bind(null, session.id);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("editSession")} description={session.team?.name} />
        <SessionForm
          action={action}
          teams={teams}
          session={session}
          lockTeam
          submitLabel={t("save")}
        />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}