"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { markAttendance } from "@/lib/credits/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { ATTENDANCE_STATUSES } from "@/lib/credits/debit-rules";
import { secondaryButtonClassName } from "@/lib/ui";

type AttendanceMarkFormProps = {
  sessionId: string;
  playerId: string;
  next: "admin" | "roster";
};

export function AttendanceMarkForm({ sessionId, playerId, next }: AttendanceMarkFormProps) {
  const t = useTranslations("credits");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(markAttendance, INITIAL_ORG_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="player_id" value={playerId} />
      <input type="hidden" name="next" value={next} />
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {ATTENDANCE_STATUSES.map((status) => (
          <button
            key={status}
            type="submit"
            name="status"
            value={status}
            disabled={pending}
            className={secondaryButtonClassName}
          >
            {pending ? org("saving") : t(`attendance.${status}`)}
          </button>
        ))}
      </div>
    </form>
  );
}
