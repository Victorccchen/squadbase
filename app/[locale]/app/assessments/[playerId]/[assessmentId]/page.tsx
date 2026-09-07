import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";
import { AssessmentReadView } from "@/components/assessments/assessment-read-view";
import { AssessmentForm } from "@/components/assessments/assessment-form";
import { AssessmentDeleteForm } from "@/components/assessments/assessment-delete-form";
import { updatePlayerAssessment } from "@/lib/assessments/actions";
import {
  getPlayerAssessment,
  staffCanWritePlayerAssessment,
} from "@/lib/assessments/queries";
import { formatIsoDate, todayInClubTimeZone } from "@/lib/age-band";
import { getPlayer } from "@/lib/org/queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { secondaryButtonClassName } from "@/lib/ui";

type AssessmentDetailPageProps = {
  params: Promise<{ playerId: string; assessmentId: string }>;
};

export default async function AssessmentDetailPage({
  params,
}: AssessmentDetailPageProps) {
  const { playerId, assessmentId } = await params;
  const player = await getPlayer(playerId);
  if (!player) {
    notFound();
  }

  const [assessment, canWrite] = await Promise.all([
    getPlayerAssessment(player.id, assessmentId),
    staffCanWritePlayerAssessment(player.id),
  ]);
  if (!assessment) {
    notFound();
  }

  const t = await getTranslations("assessments");
  const common = await getTranslations("common");
  const locale = await getLocale();

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("detailTitle", { name: localizedPlayerName(player, locale) })}
          description={canWrite ? t("editLead") : t("readOnlyLead")}
          actions={
            <Link
              href={`/app/assessments/${player.id}`}
              className={secondaryButtonClassName}
            >
              {t("backToHistory")}
            </Link>
          }
        />
        {canWrite ? (
          <>
            <AssessmentForm
              playerId={player.id}
              defaultAssessedOn={formatIsoDate(todayInClubTimeZone())}
              assessment={assessment}
              action={updatePlayerAssessment.bind(null, assessment.id)}
            />
            <AssessmentDeleteForm playerId={player.id} assessmentId={assessment.id} />
          </>
        ) : (
          <AssessmentReadView assessment={assessment} />
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
