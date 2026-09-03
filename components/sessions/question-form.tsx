"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { postSessionMessage } from "@/lib/org/session-actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { SessionMessageAuthorRole } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type QuestionFormProps = {
  registrationId: string;
  sessionId: string;
  authorRole: SessionMessageAuthorRole;
};

export function QuestionForm({ registrationId, sessionId, authorRole }: QuestionFormProps) {
  const t = useTranslations("sessions");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    postSessionMessage,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <LocaleHiddenField />
      <input type="hidden" name="registration_id" value={registrationId} />
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="author_role" value={authorRole} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {authorRole === "admin" ? t("reply") : t("askQuestion")}
        <textarea
          name="body"
          required
          rows={3}
          maxLength={2000}
          className={inputClassName}
        />
        {authorRole === "parent" ? (
          <span className="font-normal text-zinc-500">{t("questionHint")}</span>
        ) : null}
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : authorRole === "admin" ? t("sendReply") : t("sendQuestion")}
      </button>
    </form>
  );
}