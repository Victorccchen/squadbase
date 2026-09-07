"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import { secondaryButtonClassName } from "@/lib/ui";

type MatchPublishFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  isPublished: boolean;
};

export function MatchPublishForm({ action, isPublished }: MatchPublishFormProps) {
  const t = useTranslations("matches");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="is_published" value={isPublished ? "false" : "true"} />
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={secondaryButtonClassName}>
        {pending ? org("saving") : isPublished ? t("unpublish") : t("publish")}
      </button>
    </form>
  );
}
