"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { recordInvoice } from "@/lib/payments/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

export function InvoiceRecordForm({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("payments");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(recordInvoice, INITIAL_ORG_ACTION_STATE);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("invoiceNo")}
        <input
          name="invoice_no"
          required
          maxLength={20}
          pattern="[A-Za-z0-9-]{2,20}"
          placeholder="AB-12345678"
          className={`${inputClassName} w-44`}
        />
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : t("recordInvoice")}
      </button>
      {state.errorKey ? (
        <p role="alert" className="text-sm text-red-800 dark:text-red-200">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
    </form>
  );
}
