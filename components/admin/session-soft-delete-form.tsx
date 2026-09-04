"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import { dangerButtonClassName } from "@/lib/ui";

type SessionSoftDeleteFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  confirmMessage: string;
  submitLabel: string;
  redirectTo?: "detail" | "list";
};

export function SessionSoftDeleteForm({
  action,
  confirmMessage,
  submitLabel,
  redirectTo = "detail",
}: SessionSoftDeleteFormProps) {
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <LocaleHiddenField />
      <input type="hidden" name="next" value={redirectTo === "list" ? "list" : "detail"} />
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={dangerButtonClassName}>
        {pending ? org("saving") : submitLabel}
      </button>
    </form>
  );
}
