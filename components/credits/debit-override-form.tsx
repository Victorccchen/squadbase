"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { setSessionDebitOverride } from "@/lib/credits/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type DebitOverrideFormProps = {
  sessionId: string;
  noDebit: boolean;
  debitOverrideN: number | null;
};

export function DebitOverrideForm({
  sessionId,
  noDebit,
  debitOverrideN,
}: DebitOverrideFormProps) {
  const t = useTranslations("credits");
  const org = useTranslations("org");
  const action = setSessionDebitOverride.bind(null, sessionId);
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-3">
      <LocaleHiddenField />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="no_debit" value="true" defaultChecked={noDebit} />
        {t("noDebitFlag")}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("debitOverride")}
        <input
          name="debit_override_n"
          inputMode="numeric"
          defaultValue={debitOverrideN ?? ""}
          className={inputClassName}
        />
        <span className="font-normal text-zinc-500">{t("debitOverrideHint")}</span>
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : t("saveDebitOverride")}
      </button>
    </form>
  );
}
