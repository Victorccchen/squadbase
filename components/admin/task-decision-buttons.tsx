"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { decideTask } from "@/lib/tasks/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";

export function TaskDecisionButtons({ taskId }: { taskId: string }) {
  const t = useTranslations("tasks");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(decideTask, INITIAL_ORG_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="task_id" value={taskId} />
      <button type="submit" name="decision" value="done" disabled={pending} className={primaryButtonClassName}>
        {t("done")}
      </button>
      <button type="submit" name="decision" value="snoozed" disabled={pending} className={secondaryButtonClassName}>
        {t("snooze")}
      </button>
      <button type="submit" name="decision" value="dismissed" disabled={pending} className={secondaryButtonClassName}>
        {t("dismiss")}
      </button>
      {state.errorKey ? (
        <p role="alert" className="w-full text-sm text-red-700 dark:text-red-300">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
    </form>
  );
}
