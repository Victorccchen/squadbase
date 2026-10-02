"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { finalizeSessionAttendance } from "@/lib/credits/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { secondaryButtonClassName } from "@/lib/ui";

type FinalizeAttendanceFormProps = {
  sessionId: string;
  confirmMessage: string;
};

/** PR-06: staff close a special session or match; unmarked sign-ups become no-shows. */
export function FinalizeAttendanceForm({ sessionId, confirmMessage }: FinalizeAttendanceFormProps) {
  const t = useTranslations("credits");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    finalizeSessionAttendance,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col items-start gap-2"
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <LocaleHiddenField />
      <input type="hidden" name="session_id" value={sessionId} />
      <button type="submit" disabled={pending} className={secondaryButtonClassName}>
        {pending ? org("saving") : t("finalizeAttendance")}
      </button>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
    </form>
  );
}
