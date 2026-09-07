import { getTranslations } from "next-intl/server";
import { SITUATION_KEYS, TRAIT_KEYS } from "@/lib/assessments/model";
import type { PlayerAssessment } from "@/lib/supabase/database.types";

type AssessmentSummaryProps = {
  assessment: PlayerAssessment;
};

export async function AssessmentSummary({ assessment }: AssessmentSummaryProps) {
  const t = await getTranslations("assessments");

  return (
    <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-300">
      <p>
        {t("latestOn")}: {assessment.assessed_on}
      </p>
      <p>
        {SITUATION_KEYS.map(
          (key) => `${t(`situations.${key}`)} ${assessment.situations[key].score}`,
        ).join(" · ")}
      </p>
      <p>
        {TRAIT_KEYS.map((key) => `${t(`traits.${key}`)} ${assessment.traits[key].score}`).join(" · ")}
      </p>
    </div>
  );
}
