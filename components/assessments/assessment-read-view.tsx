import { getTranslations } from "next-intl/server";
import { SITUATION_KEYS, TRAIT_KEYS } from "@/lib/assessments/model";
import type { PlayerAssessment } from "@/lib/supabase/database.types";

type AssessmentReadViewProps = {
  assessment: PlayerAssessment;
};

export async function AssessmentReadView({ assessment }: AssessmentReadViewProps) {
  const t = await getTranslations("assessments");

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">{t("assessedOn")}</dt>
          <dd className="font-medium">{assessment.assessed_on}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("situationsTitle")}
        </h2>
        <p className="text-sm leading-6 text-zinc-500">{t("ctfaDisclaimer")}</p>
        <ul className="grid gap-3">
          {SITUATION_KEYS.map((key) => (
            <li
              key={key}
              className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold">{t(`situations.${key}`)}</span>
                <span className="text-sm font-medium">
                  {assessment.situations[key].score} · {t(`scores.${assessment.situations[key].score}`)}
                </span>
              </div>
              {assessment.situations[key].note ? (
                <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {assessment.situations[key].note}
                </p>
              ) : (
                <p className="text-sm text-zinc-500">{t("noNote")}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("traitsTitle")}
        </h2>
        <ul className="grid gap-3">
          {TRAIT_KEYS.map((key) => (
            <li
              key={key}
              className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold">{t(`traits.${key}`)}</span>
                <span className="text-sm font-medium">
                  {assessment.traits[key].score} · {t(`scores.${assessment.traits[key].score}`)}
                </span>
              </div>
              {assessment.traits[key].note ? (
                <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {assessment.traits[key].note}
                </p>
              ) : (
                <p className="text-sm text-zinc-500">{t("noNote")}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
