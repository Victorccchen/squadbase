"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { recordCash } from "@/lib/cash/actions";
import { INITIAL_RECORD_CASH_STATE } from "@/lib/cash/state";
import { filterCashPlayers } from "@/lib/cash/model";
import { itemsForChild, paymentItemName } from "@/lib/payments/model";
import type { PackageCatalogBand } from "@/lib/credits/debit-rules";
import type { CashPlayer } from "@/lib/cash/queries";
import type { PaymentItem } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";

type RecordCashFormProps = {
  players: CashPlayer[];
  items: PaymentItem[];
  packageBands: Record<string, PackageCatalogBand>;
  locale: string;
};

function RecordCashInner({ players, items, packageBands, locale, onDone }: RecordCashFormProps & { onDone: () => void }) {
  const t = useTranslations("cash");
  const payments = useTranslations("payments");
  const credits = useTranslations("credits");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(recordCash, INITIAL_RECORD_CASH_STATE);
  const [query, setQuery] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [itemId, setItemId] = useState("");
  const [invoice, setInvoice] = useState(false);
  const bandMap = useMemo(() => new Map(Object.entries(packageBands)), [packageBands]);
  const player = players.find((row) => row.id === playerId) ?? null;
  const matches = filterCashPlayers(players, query);
  const options = player ? itemsForChild(items, bandMap, player.band) : [];
  const item = options.find((row) => row.id === itemId) ?? null;

  if (state.receiptNo) {
    return (
      <section role="status" className="flex flex-col gap-3 rounded-2xl bg-emerald-50 p-6 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50">
        <p className="text-sm">{t("receiptIssued")}</p>
        <p className="text-3xl font-bold tracking-wide">{state.receiptNo}</p>
        <p className="text-base">
          {player?.label} · {credits("priceTwd", { amount: state.amountTwd ?? 0 })}
          {state.creditsAvailable !== null ? ` · ${credits("remainingCredits", { count: state.creditsAvailable })}` : ""}
        </p>
        <p className="text-sm">{t("receiptParentSees")}</p>
        <button type="button" onClick={onDone} className={`${primaryButtonClassName} min-h-12`}>
          {t("another")}
        </button>
      </section>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <LocaleHiddenField />
      <input type="hidden" name="player_id" value={playerId} />
      {player ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900">
          <span className="font-medium">{player.label}</span>
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() => {
              setPlayerId("");
              setItemId("");
            }}
          >
            {t("change")}
          </button>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("searchChild")}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className={`${inputClassName} min-h-12 text-base`}
            autoComplete="off"
          />
          <ul className="flex flex-col gap-2">
            {matches.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setPlayerId(row.id)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-base dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {row.label}
                </button>
              </li>
            ))}
          </ul>
        </label>
      )}

      {player ? (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {payments("item")}
            <select
              name="item_id"
              required
              value={itemId}
              onChange={(event) => setItemId(event.target.value)}
              className={`${inputClassName} min-h-12 text-base`}
            >
              <option value="">{payments("selectItem")}</option>
              {options.map((row) => (
                <option key={row.id} value={row.id}>
                  {paymentItemName(row, locale)}
                  {row.price_twd !== null ? ` · ${credits("priceTwd", { amount: row.price_twd })}` : ""}
                </option>
              ))}
            </select>
          </label>
          {item && item.kind !== "credit_package" ? (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {payments("amount")}
              <input
                name="amount_twd"
                required
                inputMode="numeric"
                key={item.id}
                defaultValue={item.price_twd ?? ""}
                className={`${inputClassName} min-h-12 text-base`}
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("note")}
            <input name="note" maxLength={300} className={inputClassName} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="invoice_needed" value="true" checked={invoice} onChange={(e) => setInvoice(e.target.checked)} />
            {payments("invoiceNeeded")}
          </label>
          {invoice ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="invoice_tax_id" inputMode="numeric" maxLength={8} placeholder={payments("taxId")} className={inputClassName} />
              <input name="invoice_title" maxLength={100} placeholder={payments("invoiceTitle")} className={inputClassName} />
            </div>
          ) : null}
        </>
      ) : null}

      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || !player || !itemId}
        className={`${primaryButtonClassName} min-h-14 text-lg`}
      >
        {pending ? org("saving") : t("confirmReceipt")}
      </button>
    </form>
  );
}

/** PR-08b (D13): phone-first cash at the field. A new key resets the form for the next family. */
export function RecordCashForm(props: RecordCashFormProps) {
  const [round, setRound] = useState(0);
  return <RecordCashInner key={round} {...props} onDone={() => setRound((value) => value + 1)} />;
}
