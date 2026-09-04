"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { adjustSessionCredits } from "@/lib/credits/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { localizedPlayerName } from "@/lib/org/display-name";
import type { Player } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type AdjustCreditsFormProps = {
  players: Player[];
  locale: string;
};

export function AdjustCreditsForm({ players, locale }: AdjustCreditsFormProps) {
  const t = useTranslations("credits");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    adjustSessionCredits,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("selectPlayer")}
        <select name="player_id" required defaultValue="" className={inputClassName}>
          <option value="">{t("selectPlayer")}</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {localizedPlayerName(player, locale)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("adjustAmount")}
        <input name="amount" required className={inputClassName} placeholder="+10 or -1" />
        <span className="font-normal text-zinc-500">{t("adjustAmountHint")}</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("adjustReason")}
        <textarea name="reason" required minLength={3} maxLength={500} rows={2} className={inputClassName} />
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : t("saveAdjust")}
      </button>
    </form>
  );
}
