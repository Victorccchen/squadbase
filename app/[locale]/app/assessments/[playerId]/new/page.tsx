import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { AssessmentForm } from "@/components/assessments/assessment-form";
import { createPlayerAssessment } from "@/lib/assessments/actions";
import { staffCanWritePlayerAssessment } from "@/lib/assessments/queries";
import { formatIsoDate, todayInClubTimeZone } from "@/lib/age-band";
import { getPlayer } from "@/lib/org/queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { secondaryButtonClassName } from "@/lib/ui";

type NewAssessmentPageProps = {
  params: Promise<{ playerId: string }>;
};

export default async function NewAssessmentPage({ params }: NewAssessmentPageProps) {
  const { playerId } = await params;
  const player = await getPlayer(playerId);
  if (!player) {
    notFound();
  }

  const canWrite = await staffCanWritePlayerAssessment(player.id);
  if (!canWrite) {
    return <AccessDenied area="assessments" />;
  }

  const t = await getTranslations("assessments");
  const common = await getTranslations("common");
  const locale = await getLocale();

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("createTitle", { name: localizedPlayerName(player, locale) })}
          description={t("createLead")}
          actions={
            <Link
              href={`/app/assessments/${player.id}`}
              className={secondaryButtonClassName}
            >
              {t("backToHistory")}
            </Link>
          }
        />
        <AssessmentForm
          playerId={player.id}
          defaultAssessedOn={formatIsoDate(todayInClubTimeZone())}
          action={createPlayerAssessment}
        />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
