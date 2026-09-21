"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import {
  ASSESSMENT_SCORES,
  MAX_ASSESSMENT_NOTE,
  PHASE_CODES,
  PHASE_HINT_KEY,
  TRAIT_CODES,
  clubDateFromTimestamp,
  scoreFieldName,
  type PhaseCode,
  type TraitCode,
} from "@/lib/assessments/model";
import { scoreMapForKind } from "@/lib/assessments/series";
import type { AssessmentLinkSession } from "@/lib/assessments/queries";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { AssessmentEventWithScores } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type AssessmentFormProps = {
  playerId: string;
  defaultAssessedOn: string;
  event?: AssessmentEventWithScores;
  sessions: AssessmentLinkSession[];
  sessionLabels: Record<string, string>;
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
};

function ScoreRadios({
  name,
  defaultValue,
  scoreLabel,
  skipLabel,
}: {
  name: string;
  defaultValue?: number;
  scoreLabel: (score: number) => string;
  skipLabel: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-zinc-300 px-2 py-2 text-center text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white dark:border-zinc-700 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-100 dark:has-[:checked]:text-zinc-900">
        <input
          type="radio"
          name={name}
          value=""
          defaultChecked={defaultValue == null}
          className="sr-only"
        />
        <span className="text-base font-semibold">—</span>
        <span className="text-[11px] leading-4 opacity-80">{skipLabel}</span>
      </label>
      {ASSESSMENT_SCORES.map((score) => (
        <label
          key={score}
          className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-zinc-300 px-2 py-2 text-center text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white dark:border-zinc-700 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-100 dark:has-[:checked]:text-zinc-900"
        >
          <input
            type="radio"
            name={name}
            value={score}
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
  event,
  sessions,
  sessionLabels,
  action,
}: AssessmentFormProps) {
  const t = useTranslations("assessments");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  const traitScores = event ? scoreMapForKind(event.scores, "trait") : new Map();
  const phaseScores = event ? scoreMapForKind(event.scores, "phase") : new Map();
  const defaultDate = event
    ? clubDateFromTimestamp(event.assessed_at)
    : defaultAssessedOn;

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
          defaultValue={defaultDate}
          className={inputClassName}
        />
        <span className="font-normal text-zinc-500">{t("assessedOnHint")}</span>
      </label>

      <label className="flex max-w-xl flex-col gap-1.5 text-sm font-medium">
        {t("sessionLink")}
        <select
          name="session_id"
          defaultValue={event?.session_id ?? ""}
          className={inputClassName}
        >
          <option value="">{t("sessionNone")}</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {sessionLabels[session.id] ?? session.title}
            </option>
          ))}
        </select>
        <span className="font-normal text-zinc-500">{t("sessionLinkHint")}</span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("eventNote")}
        <textarea
          name="note"
          maxLength={MAX_ASSESSMENT_NOTE}
          rows={3}
          defaultValue={event?.note ?? ""}
          className={inputClassName}
        />
        <span className="font-normal text-zinc-500">{t("noteHint")}</span>
      </label>

      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {t("partialHint")}
      </p>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("traitsTitle")}
          </h2>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("traitsLead")}</p>
        </div>
        {TRAIT_CODES.map((code: TraitCode) => (
          <fieldset
            key={code}
            className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <legend className="px-1 text-base font-semibold">{t(`traits.${code}`)}</legend>
            <ScoreRadios
              name={scoreFieldName("trait", code)}
              defaultValue={traitScores.get(code)}
              scoreLabel={(score) => t(`scores.${score}`)}
              skipLabel={t("skipScore")}
            />
          </fieldset>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("phasesTitle")}
          </h2>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {t("phasesLead")}
          </p>
          <p className="text-sm leading-6 text-zinc-500">{t("ctfaDisclaimer")}</p>
        </div>
        {PHASE_CODES.map((code: PhaseCode) => (
          <fieldset
            key={code}
            className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <legend className="px-1 text-base font-semibold">{t(`phases.${code}`)}</legend>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t("hintsTitle")}
            </p>
            <HintList items={t.raw(`hints.${PHASE_HINT_KEY[code]}`) as string[]} />
            <ScoreRadios
              name={scoreFieldName("phase", code)}
              defaultValue={phaseScores.get(code)}
              scoreLabel={(score) => t(`scores.${score}`)}
              skipLabel={t("skipScore")}
            />
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
        {pending ? org("saving") : event ? t("save") : t("submit")}
      </button>
    </form>
  );
}
