"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type MatchResultFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  clubScore: number | null;
  opponentScore: number | null;
  resultNote: string | null;
};

export function MatchResultForm({
  action,
  clubScore,
  opponentScore,
  resultNote,
}: MatchResultFormProps) {
  const t = useTranslations("matches");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <LocaleHiddenField />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("clubScore")}
        <input
          name="club_score"
          required
          inputMode="numeric"
          defaultValue={clubScore ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("opponentScore")}
        <input
          name="opponent_score"
          required
          inputMode="numeric"
          defaultValue={opponentScore ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
        {t("resultNote")}
        <input
          name="result_note"
          maxLength={200}
          defaultValue={resultNote ?? ""}
          className={inputClassName}
        />
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100 sm:col-span-2">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${primaryButtonClassName} sm:col-span-2`}>
        {pending ? org("saving") : t("saveResult")}
      </button>
    </form>
  );
}
