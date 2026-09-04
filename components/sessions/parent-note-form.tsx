"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { updateSessionRegistrationNote } from "@/lib/org/session-actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type ParentNoteFormProps = {
  registrationId: string;
  sessionId: string;
  initialNote: string | null;
};

export function ParentNoteForm({
  registrationId,
  sessionId,
  initialNote,
}: ParentNoteFormProps) {
  const t = useTranslations("sessions");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    updateSessionRegistrationNote,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <input type="hidden" name="registration_id" value={registrationId} />
      <input type="hidden" name="session_id" value={sessionId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("parentNote")}
        <textarea
          name="parent_note"
          rows={4}
          maxLength={1000}
          defaultValue={initialNote ?? ""}
          className={inputClassName}
        />
        <span className="font-normal text-zinc-500">{t("parentNoteHint")}</span>
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : t("submitNote")}
      </button>
    </form>
  );
}
