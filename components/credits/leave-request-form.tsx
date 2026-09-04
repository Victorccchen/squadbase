"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { requestExcusedLeave } from "@/lib/credits/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { inputClassName, secondaryButtonClassName } from "@/lib/ui";

type LeaveRequestFormProps = {
  registrationId: string;
  sessionId: string;
};

export function LeaveRequestForm({ registrationId, sessionId }: LeaveRequestFormProps) {
  const t = useTranslations("credits");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    requestExcusedLeave,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-3">
      <LocaleHiddenField />
      <input type="hidden" name="registration_id" value={registrationId} />
      <input type="hidden" name="session_id" value={sessionId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("leaveNote")}
        <textarea name="parent_note" rows={2} maxLength={1000} className={inputClassName} />
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={secondaryButtonClassName}>
        {pending ? org("saving") : t("requestLeave")}
      </button>
    </form>
  );
}
