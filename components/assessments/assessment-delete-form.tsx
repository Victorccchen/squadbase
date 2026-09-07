"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { deletePlayerAssessment } from "@/lib/assessments/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { dangerButtonClassName } from "@/lib/ui";

type AssessmentDeleteFormProps = {
  playerId: string;
  assessmentId: string;
};

export function AssessmentDeleteForm({
  playerId,
  assessmentId,
}: AssessmentDeleteFormProps) {
  const t = useTranslations("assessments");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    deletePlayerAssessment,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <LocaleHiddenField />
      <input type="hidden" name="player_id" value={playerId} />
      <input type="hidden" name="assessment_id" value={assessmentId} />
      {state.errorKey ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100"
        >
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={dangerButtonClassName}
        onClick={(event) => {
          if (!window.confirm(t("deleteConfirm"))) {
            event.preventDefault();
          }
        }}
      >
        {pending ? org("saving") : t("delete")}
      </button>
    </form>
  );
}
