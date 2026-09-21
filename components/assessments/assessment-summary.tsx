import { getTranslations } from "next-intl/server";
import { PHASE_CODES, TRAIT_CODES, clubDateFromTimestamp } from "@/lib/assessments/model";
import { scoreMapForKind } from "@/lib/assessments/series";
import type { AssessmentEventWithScores } from "@/lib/supabase/database.types";

type AssessmentSummaryProps = {
  event: AssessmentEventWithScores;
};

export async function AssessmentSummary({ event }: AssessmentSummaryProps) {
  const t = await getTranslations("assessments");
  const traits = scoreMapForKind(event.scores, "trait");
  const phases = scoreMapForKind(event.scores, "phase");

  return (
    <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-300">
      <p>
        {t("latestOn")}: {clubDateFromTimestamp(event.assessed_at)}
      </p>
      <p>
        {TRAIT_CODES.filter((code) => traits.has(code))
          .map((code) => `${t(`traits.${code}`)} ${traits.get(code)}`)
          .join(" · ") || t("noTraitScores")}
      </p>
      <p>
        {PHASE_CODES.filter((code) => phases.has(code))
          .map((code) => `${t(`phases.${code}`)} ${phases.get(code)}`)
          .join(" · ") || t("noPhaseScores")}
      </p>
    </div>
  );
}
