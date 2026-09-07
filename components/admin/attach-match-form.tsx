"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type AttachMatchFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
};

export function AttachMatchForm({ action }: AttachMatchFormProps) {
  const t = useTranslations("matches");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("attachLead")}</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("opponent")}
        <input
          name="opponent"
          maxLength={200}
          placeholder={t("opponentTbd")}
          className={inputClassName}
        />
      </label>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("opponentHint")}</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("side")}
        <select name="side" defaultValue="home" className={inputClassName}>
          <option value="home">{t("sides.home")}</option>
          <option value="away">{t("sides.away")}</option>
        </select>
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : t("attachSubmit")}
      </button>
    </form>
  );
}
