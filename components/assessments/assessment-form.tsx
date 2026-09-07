"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import {
  ASSESSMENT_SCORES,
  MAX_ASSESSMENT_NOTE,
  SITUATION_KEYS,
  TRAIT_KEYS,
  type SituationKey,
  type TraitKey,
} from "@/lib/assessments/model";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { PlayerAssessment } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type AssessmentFormProps = {
  playerId: string;
  defaultAssessedOn: string;
  assessment?: PlayerAssessment;
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
};

function ScoreRadios({
  name,
  defaultValue,
  scoreLabel,
}: {
  name: string;
  defaultValue?: number;
  scoreLabel: (score: number) => string;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {ASSESSMENT_SCORES.map((score) => (
        <label
          key={score}
          className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-zinc-300 px-2 py-2 text-center text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white dark:border-zinc-700 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-100 dark:has-[:checked]:text-zinc-900"
        >
          <input
            type="radio"
            name={name}
            value={score}
            required
            defaultChecked={defaultValue === score}
            className="sr-only"
          />
          <span className="text-base font-semibold">{score}</span>
          <span className="text-[11px] leading-4 opacity-80">{scoreLabel(score)}</span>
        </label>
      ))}
    </div>
  );
}

function HintList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-500">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function AssessmentForm({
  playerId,
  defaultAssessedOn,
  assessment,
  action,
}: AssessmentFormProps) {
  const t = useTranslations("assessments");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <LocaleHiddenField />
      <input type="hidden" name="player_id" value={playerId} />
      <label className="flex max-w-xs flex-col gap-1.5 text-sm font-medium">
        {t("assessedOn")}
        <input
          type="date"
          name="assessed_on"
          required
          defaultValue={assessment?.assessed_on ?? defaultAssessedOn}
          className={inputClassName}
        />
        <span className="font-normal text-zinc-500">{t("assessedOnHint")}</span>
      </label>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("situationsTitle")}
          </h2>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {t("situationsLead")}
          </p>
          <p className="text-sm leading-6 text-zinc-500">{t("ctfaDisclaimer")}</p>
        </div>
        {SITUATION_KEYS.map((key: SituationKey) => (
          <fieldset
            key={key}
            className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <legend className="px-1 text-base font-semibold">{t(`situations.${key}`)}</legend>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t("hintsTitle")}
            </p>
            <HintList items={t.raw(`hints.${key}`) as string[]} />
            <ScoreRadios
              name={`sit_${key}_score`}
              defaultValue={assessment?.situations[key].score}
              scoreLabel={(score) => t(`scores.${score}`)}
            />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("note")}
              <textarea
                name={`sit_${key}_note`}
                maxLength={MAX_ASSESSMENT_NOTE}
                rows={3}
                defaultValue={assessment?.situations[key].note ?? ""}
                className={inputClassName}
              />
              <span className="font-normal text-zinc-500">{t("noteHint")}</span>
            </label>
          </fieldset>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("traitsTitle")}
          </h2>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("traitsLead")}</p>
        </div>
        {TRAIT_KEYS.map((key: TraitKey) => (
          <fieldset
            key={key}
            className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <legend className="px-1 text-base font-semibold">{t(`traits.${key}`)}</legend>
            <ScoreRadios
              name={`trait_${key}_score`}
              defaultValue={assessment?.traits[key].score}
              scoreLabel={(score) => t(`scores.${score}`)}
            />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("note")}
              <textarea
                name={`trait_${key}_note`}
                maxLength={MAX_ASSESSMENT_NOTE}
                rows={3}
                defaultValue={assessment?.traits[key].note ?? ""}
                className={inputClassName}
              />
            </label>
          </fieldset>
        ))}
      </section>

      {state.errorKey ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100"
        >
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : assessment ? t("save") : t("submit")}
      </button>
    </form>
  );
}
