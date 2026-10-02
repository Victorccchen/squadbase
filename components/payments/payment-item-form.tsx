"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { savePaymentItem } from "@/lib/payments/actions";
import { STAFF_ITEM_KINDS } from "@/lib/payments/model";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { PaymentItem } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

/** PR-08a: kit, match fee, camp and other items. Credit packages are managed above. */
export function PaymentItemForm({ item }: { item?: PaymentItem }) {
  const t = useTranslations("payments");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(savePaymentItem, INITIAL_ORG_ACTION_STATE);
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <LocaleHiddenField />
      {item ? <input type="hidden" name="item_id" value={item.id} /> : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("itemKind")}
        <select name="kind" defaultValue={item?.kind ?? "kit"} className={inputClassName}>
          {STAFF_ITEM_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("itemPrice")}
        <input
          name="price_twd"
          inputMode="numeric"
          pattern="[0-9,]{1,7}"
          defaultValue={item?.price_twd ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("nameZh")}
        <input name="name_zh" required maxLength={120} defaultValue={item?.name_i18n["zh-Hant"] ?? ""} className={inputClassName} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("nameJa")}
        <input name="name_ja" maxLength={120} defaultValue={item?.name_i18n.ja ?? ""} className={inputClassName} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("nameEn")}
        <input name="name_en" maxLength={120} defaultValue={item?.name_i18n.en ?? ""} className={inputClassName} />
      </label>
      {item ? (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="hidden" name="active" value="false" />
          <input type="checkbox" name="active" value="true" defaultChecked={item.active} />
          {t("itemActive")}
        </label>
      ) : null}
      <div className="flex flex-col gap-2 sm:col-span-2">
        {state.errorKey ? (
          <p role="alert" className="text-sm text-red-800 dark:text-red-200">
            {org(`errors.${state.errorKey}`)}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className={primaryButtonClassName}>
          {pending ? org("saving") : item ? t("saveItem") : t("addItem")}
        </button>
      </div>
    </form>
  );
}
