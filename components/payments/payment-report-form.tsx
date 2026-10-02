"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { submitPaymentReport } from "@/lib/payments/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { itemsForChild, paymentItemName } from "@/lib/payments/model";
import type { PackageCatalogBand } from "@/lib/credits/debit-rules";
import type { PaymentItem } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

export type PaymentReportChild = {
  playerId: string;
  label: string;
  /** Catalog band of the primary 梯隊; null when credits do not apply. */
  band: PackageCatalogBand | null;
};

type PaymentReportFormProps = {
  childrenOptions: PaymentReportChild[];
  items: PaymentItem[];
  packageBands: Record<string, PackageCatalogBand>;
  locale: string;
  transferHint: string;
  today: string;
};

/** PR-08a: one form for every transfer — credit packages, kit, match fees, camps. */
export function PaymentReportForm({
  childrenOptions,
  items,
  packageBands,
  locale,
  transferHint,
  today,
}: PaymentReportFormProps) {
  const t = useTranslations("payments");
  const credits = useTranslations("credits");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(submitPaymentReport, INITIAL_ORG_ACTION_STATE);
  const [playerId, setPlayerId] = useState(childrenOptions.length === 1 ? childrenOptions[0]!.playerId : "");
  const [itemId, setItemId] = useState("");
  const [invoice, setInvoice] = useState(false);

  const child = childrenOptions.find((row) => row.playerId === playerId) ?? null;
  const bandMap = useMemo(() => new Map(Object.entries(packageBands)), [packageBands]);
  const options = child ? itemsForChild(items, bandMap, child.band) : [];
  const item = options.find((row) => row.id === itemId) ?? null;

  if (childrenOptions.length === 0) {
    return <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{credits("buyEmpty")}</p>;
  }

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {credits("selectChild")}
        <select
          name="player_id"
          required
          value={playerId}
          onChange={(event) => {
            setPlayerId(event.target.value);
            setItemId("");
          }}
          className={inputClassName}
        >
          {childrenOptions.length > 1 ? <option value="">{credits("selectChild")}</option> : null}
          {childrenOptions.map((row) => (
            <option key={row.playerId} value={row.playerId}>
              {row.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("item")}
        <select
          name="item_id"
          required
          value={itemId}
          onChange={(event) => setItemId(event.target.value)}
          className={inputClassName}
          disabled={!child}
        >
          <option value="">{t("selectItem")}</option>
          {options.map((row) => (
            <option key={row.id} value={row.id}>
              {paymentItemName(row, locale)}
              {row.price_twd !== null ? ` · ${credits("priceTwd", { amount: row.price_twd })}` : ""}
            </option>
          ))}
        </select>
        {child && child.band === null ? (
          <span className="font-normal text-zinc-500">{t("noPackagesForChild")}</span>
        ) : null}
      </label>

      {item && item.kind !== "credit_package" ? (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("amount")}
          <input
            name="amount_twd"
            required
            inputMode="numeric"
            pattern="[0-9,]{1,7}"
            key={item.id}
            defaultValue={item.price_twd ?? ""}
            className={inputClassName}
          />
        </label>
      ) : null}

      <div className="rounded-xl bg-zinc-100 px-4 py-3 text-sm leading-6 dark:bg-zinc-800">
        <p className="font-medium">{credits("transferTitle")}</p>
        <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
          {transferHint || credits("transferHintMissing")}
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("transferDate")}
        <input name="transfer_date" type="date" required max={today} defaultValue={today} className={inputClassName} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {credits("last5")}
        <input
          name="last5"
          required
          inputMode="numeric"
          maxLength={5}
          pattern="[0-9]{5}"
          className={inputClassName}
        />
        <span className="font-normal text-zinc-500">{credits("last5Hint")}</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("screenshot")}
        <input name="screenshot" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" />
        <span className="font-normal text-zinc-500">{t("screenshotHint")}</span>
      </label>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="invoice_needed"
          value="true"
          checked={invoice}
          onChange={(event) => setInvoice(event.target.checked)}
        />
        {t("invoiceNeeded")}
      </label>
      {invoice ? (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("taxId")}
            <input name="invoice_tax_id" inputMode="numeric" maxLength={8} pattern="[0-9]{8}" className={inputClassName} />
            <span className="font-normal text-zinc-500">{t("taxIdHint")}</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("invoiceTitle")}
            <input name="invoice_title" maxLength={100} className={inputClassName} />
          </label>
        </div>
      ) : null}

      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? credits("submitting") : t("submit")}
      </button>
    </form>
  );
}
