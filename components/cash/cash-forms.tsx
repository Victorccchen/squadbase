"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { closeCashDay, reconcileDeposit, recordDeposit, setDirector, voidCashReceipt } from "@/lib/cash/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import {
  dangerButtonClassName,
  inputClassName,
  primaryButtonClassName,
  quietButtonClassName,
  secondaryButtonClassName,
} from "@/lib/ui";

function ErrorLine({ errorKey }: { errorKey: string | null }) {
  const org = useTranslations("org");
  return errorKey ? (
    <p role="alert" className="text-sm text-red-800 dark:text-red-200">
      {org(`errors.${errorKey}`)}
    </p>
  ) : null;
}

export function VoidReceiptForm({ receiptId }: { receiptId: string }) {
  const t = useTranslations("cash");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(voidCashReceipt, INITIAL_ORG_ACTION_STATE);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="receipt_id" value={receiptId} />
      <input name="reason" required minLength={2} maxLength={300} placeholder={t("voidReason")} className={`${inputClassName} w-44`} />
      <button type="submit" disabled={pending} className={quietButtonClassName}>
        {pending ? org("saving") : t("void")}
      </button>
      <ErrorLine errorKey={state.errorKey} />
    </form>
  );
}

export function CloseDayForm({ day, label, confirmMessage }: { day: string; label: string; confirmMessage: string }) {
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(closeCashDay, INITIAL_ORG_ACTION_STATE);
  return (
    <form
      action={formAction}
      className="flex flex-col items-start gap-2"
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <LocaleHiddenField />
      <input type="hidden" name="day" value={day} />
      <button type="submit" disabled={pending} className={`${primaryButtonClassName} min-h-12`}>
        {pending ? org("saving") : label}
      </button>
      <ErrorLine errorKey={state.errorKey} />
    </form>
  );
}

export function DepositForm({
  closings,
  today,
}: {
  closings: { id: string; label: string; total: number }[];
  today: string;
}) {
  const t = useTranslations("cash");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(recordDeposit, INITIAL_ORG_ACTION_STATE);
  const [selected, setSelected] = useState<string[]>(closings.map((row) => row.id));
  const total = closings.filter((row) => selected.includes(row.id)).reduce((sum, row) => sum + row.total, 0);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <LocaleHiddenField />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("depositClosings")}</legend>
        {closings.map((row) => (
          <label key={row.id} className="flex min-h-11 items-center gap-3 text-base">
            <input
              type="checkbox"
              name="closing_id"
              value={row.id}
              className="size-5"
              checked={selected.includes(row.id)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id),
                )
              }
            />
            {row.label}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("depositAmount")}
        <input name="amount_twd" required inputMode="numeric" key={total} defaultValue={total || ""} className={`${inputClassName} min-h-12 text-base`} />
        <span className="font-normal text-zinc-500">{t("depositAmountHint", { total })}</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("depositDate")}
        <input name="deposit_date" type="date" required max={today} defaultValue={today} className={inputClassName} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("depositSlip")}
        <input name="slip" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("note")}
        <input name="note" maxLength={300} className={inputClassName} />
      </label>
      <ErrorLine errorKey={state.errorKey} />
      <button type="submit" disabled={pending || selected.length === 0} className={`${primaryButtonClassName} min-h-12`}>
        {pending ? org("saving") : t("recordDeposit")}
      </button>
    </form>
  );
}

export function ReconcileForm({ depositId, disabledReason }: { depositId: string; disabledReason: string | null }) {
  const t = useTranslations("cash");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(reconcileDeposit, INITIAL_ORG_ACTION_STATE);
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="deposit_id" value={depositId} />
      <button type="submit" disabled={pending || Boolean(disabledReason)} className={primaryButtonClassName}>
        {pending ? org("saving") : t("reconcile")}
      </button>
      {disabledReason ? <p className="text-sm text-zinc-500">{disabledReason}</p> : null}
      <ErrorLine errorKey={state.errorKey} />
    </form>
  );
}

export function DirectorRoleForm({ userId, isDirector }: { userId: string; isDirector: boolean }) {
  const t = useTranslations("cash");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(setDirector, INITIAL_ORG_ACTION_STATE);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="enabled" value={isDirector ? "false" : "true"} />
      <button type="submit" disabled={pending} className={isDirector ? dangerButtonClassName : secondaryButtonClassName}>
        {pending ? org("saving") : isDirector ? t("removeDirector") : t("makeDirector")}
      </button>
      <ErrorLine errorKey={state.errorKey} />
    </form>
  );
}
