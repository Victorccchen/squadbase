import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";
import { getTeam } from "@/lib/org/queries";
import { secondaryButtonClassName } from "@/lib/ui";

type TeamDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TeamDetailPage({ params }: TeamDetailPageProps) {
  const { id } = await params;
  const team = await getTeam(id);
  if (!team) {
    notFound();
  }

  const t = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={team.name}
          actions={
            <Link href={`/app/admin/teams/${team.id}/edit`} className={secondaryButtonClassName}>
              {t("edit")}
            </Link>
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
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
