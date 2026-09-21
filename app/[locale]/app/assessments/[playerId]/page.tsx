import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { AbilityLineChart } from "@/components/assessments/ability-line-chart";
import {
  listPlayerAssessmentEvents,
  staffCanWritePlayerAssessment,
} from "@/lib/assessments/queries";
import { clubDateFromTimestamp, dimensionLabelKey } from "@/lib/assessments/model";
import { buildDimensionSeries, colorForSeries } from "@/lib/assessments/series";
import { getPlayer } from "@/lib/org/queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";

type PlayerAssessmentsPageProps = {
  params: Promise<{ playerId: string }>;
};

export default async function PlayerAssessmentsPage({
  params,
}: PlayerAssessmentsPageProps) {
  const { playerId } = await params;
  const player = await getPlayer(playerId);
  if (!player) {
    notFound();
  }

  const t = await getTranslations("assessments");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const [history, canWrite] = await Promise.all([
    listPlayerAssessmentEvents(player.id),
    staffCanWritePlayerAssessment(player.id),
  ]);

  const traitSeries = buildDimensionSeries(history, "trait").map((item) => ({
    ...item,
    label: t(dimensionLabelKey(item.kind, item.code)),
    color: colorForSeries(item),
  }));
  const phaseSeries = buildDimensionSeries(history, "phase").map((item) => ({
    ...item,
    label: t(dimensionLabelKey(item.kind, item.code)),
    color: colorForSeries(item),
  }));

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("historyTitle", { name: localizedPlayerName(player, locale) })}
          description={t("historyLead")}
          actions={
            <span className="flex flex-wrap gap-2">
              <Link href="/app/assessments" className={secondaryButtonClassName}>
                {t("backToList")}
              </Link>
              {canWrite ? (
                <Link
                  href={`/app/assessments/${player.id}/new`}
                  className={primaryButtonClassName}
                >
                  {t("create")}
                </Link>
              ) : null}
            </span>
          }
        />
        <AbilityLineChart
          title={t("traitsChartTitle")}
          emptyTitle={t("chartEmptyTitle")}
          emptyBody={t("chartEmptyBody")}
          series={traitSeries}
        />
        <AbilityLineChart
          title={t("phasesChartTitle")}
          emptyTitle={t("chartEmptyTitle")}
          emptyBody={t("chartEmptyBody")}
          series={phaseSeries}
        />
        {history.length === 0 ? (
          <EmptyState title={t("historyEmptyTitle")} body={t("historyEmptyBody")} />
        ) : (
          <ul className="grid gap-3">
            {history.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/app/assessments/${player.id}/${event.id}`}
                  className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="font-semibold">
                    {clubDateFromTimestamp(event.assessed_at)}
                  </span>
                  <span className="text-sm text-zinc-500">{t("openDetail")}</span>
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
