import { getTranslations } from "next-intl/server";
import { PHASE_CODES, TRAIT_CODES, clubDateFromTimestamp } from "@/lib/assessments/model";
import { scoreMapForKind } from "@/lib/assessments/series";
import type { AssessmentEventWithScores } from "@/lib/supabase/database.types";

type AssessmentReadViewProps = {
  event: AssessmentEventWithScores;
  sessionLabel: string | null;
};

export async function AssessmentReadView({
  event,
  sessionLabel,
}: AssessmentReadViewProps) {
  const t = await getTranslations("assessments");
  const traits = scoreMapForKind(event.scores, "trait");
  const phases = scoreMapForKind(event.scores, "phase");

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">{t("assessedOn")}</dt>
          <dd className="font-medium">{clubDateFromTimestamp(event.assessed_at)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">{t("sessionLink")}</dt>
          <dd className="font-medium">{sessionLabel ?? t("sessionNone")}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-zinc-500">{t("eventNote")}</dt>
          <dd className="leading-6">
            {event.note ? event.note : t("noNote")}
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("traitsTitle")}
        </h2>
        <ul className="grid gap-3">
          {TRAIT_CODES.map((code) => {
            const score = traits.get(code);
            return (
            <li
              key={code}
              className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="font-semibold">{t(`traits.${code}`)}</span>
              <span className="text-sm font-medium">
                {score != null ? `${score} · ${t(`scores.${score}`)}` : t("skipScore")}
              </span>
            </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("phasesTitle")}
        </h2>
        <ul className="grid gap-3">
          {PHASE_CODES.map((code) => {
            const score = phases.get(code);
            return (
            <li
              key={code}
              className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="font-semibold">{t(`phases.${code}`)}</span>
              <span className="text-sm font-medium">
                {score != null ? `${score} · ${t(`scores.${score}`)}` : t("skipScore")}
              </span>
            </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
