"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { revokeApprovedGuardianLink } from "@/lib/org/binding-actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { dangerButtonClassName, inputClassName } from "@/lib/ui";

type BindingRevokeFormProps = {
  linkId: string;
};

export function BindingRevokeForm({ linkId }: BindingRevokeFormProps) {
  const t = useTranslations("admin");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    revokeApprovedGuardianLink,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <LocaleHiddenField />
      <input type="hidden" name="link_id" value={linkId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("revokeNote")}
        <textarea name="admin_note" rows={2} maxLength={1000} className={inputClassName} />
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={dangerButtonClassName}>
        {pending ? org("saving") : t("revoke")}
      </button>
    </form>
  );
}
