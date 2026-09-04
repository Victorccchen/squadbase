"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { setBankTransferHint } from "@/lib/credits/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type TransferHintFormProps = {
  currentHint: string;
};

export function TransferHintForm({ currentHint }: TransferHintFormProps) {
  const t = useTranslations("credits");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    setBankTransferHint,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-3">
      <LocaleHiddenField />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("transferHintLabel")}
        <textarea
          name="bank_transfer_hint"
          rows={4}
          maxLength={2000}
          defaultValue={currentHint}
          className={inputClassName}
        />
        <span className="font-normal text-zinc-500">{t("transferHintAdminHelp")}</span>
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : t("saveTransferHint")}
      </button>
    </form>
  );
}
