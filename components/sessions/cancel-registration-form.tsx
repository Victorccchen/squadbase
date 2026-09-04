"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { cancelSessionRegistration } from "@/lib/org/session-actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { dangerButtonClassName } from "@/lib/ui";

type CancelRegistrationFormProps = {
  registrationId: string;
  sessionId: string;
  locked?: boolean;
  returnTo?: "list" | "detail";
};

export function CancelRegistrationForm({
  registrationId,
  sessionId,
  locked = false,
  returnTo = "detail",
}: CancelRegistrationFormProps) {
  const t = useTranslations("sessions");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    cancelSessionRegistration,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="registration_id" value={registrationId} />
      <input type="hidden" name="session_id" value={sessionId} />
      {returnTo === "list" ? <input type="hidden" name="return_to" value="list" /> : null}
      {locked ? (
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("cancelLocked")}</p>
      ) : null}
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending || locked} className={dangerButtonClassName}>
        {pending ? org("saving") : t("cancel")}
      </button>
    </form>
  );
}
