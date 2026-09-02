"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { cancelPendingGuardianLink } from "@/lib/org/binding-actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { secondaryButtonClassName } from "@/lib/ui";

type CancelLinkFormProps = {
  linkId: string;
};

export function CancelLinkForm({ linkId }: CancelLinkFormProps) {
  const t = useTranslations("children");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    cancelPendingGuardianLink,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="link_id" value={linkId} />
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={secondaryButtonClassName}>
        {pending ? org("saving") : t("cancelRequest")}
      </button>
    </form>
  );
}
