"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { switchSessionRegistration } from "@/lib/org/session-actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { TrainingSessionWithTeam } from "@/lib/org/session-queries";
import { formatClubDateTimeRange } from "@/lib/org/session-time";
import { inputClassName, secondaryButtonClassName } from "@/lib/ui";

type ChangeSessionFormProps = {
  registrationId: string;
  options: TrainingSessionWithTeam[];
  locale: string;
};

export function ChangeSessionForm({
  registrationId,
  options,
  locale,
}: ChangeSessionFormProps) {
  const t = useTranslations("sessions");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    switchSessionRegistration,
    INITIAL_ORG_ACTION_STATE,
  );

  if (options.length === 0) {
    return null;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <LocaleHiddenField />
      <input type="hidden" name="registration_id" value={registrationId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("changeTo")}
        <select name="new_session_id" required className={inputClassName}>
          <option value="">{t("changeTo")}</option>
          {options.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title} · {session.team?.name ?? ""} · {formatClubDateTimeRange(session.starts_at, session.ends_at, locale)}
            </option>
          ))}
        </select>
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={secondaryButtonClassName}>
        {pending ? org("saving") : t("change")}
      </button>
    </form>
  );
}