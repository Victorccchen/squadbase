"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { OrgStatus } from "@/lib/supabase/database.types";
import { secondaryButtonClassName } from "@/lib/ui";

type SessionStatusFormProps = {
  status: OrgStatus;
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  redirectTo?: "detail" | "list";
};

export function SessionStatusForm({
  status,
  action,
  redirectTo = "detail",
}: SessionStatusFormProps) {
  const t = useTranslations("admin");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  const nextStatus = status === "active" ? "inactive" : "active";

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="status" value={nextStatus} />
      <input type="hidden" name="next" value={redirectTo === "list" ? "list" : "detail"} />
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={secondaryButtonClassName}>
        {pending
          ? org("saving")
          : nextStatus === "inactive"
            ? t("deactivateSession")
            : t("reactivateSession")}
      </button>
    </form>
  );
}