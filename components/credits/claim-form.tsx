"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { submitPaymentClaim } from "@/lib/credits/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { SessionPackage } from "@/lib/supabase/database.types";
import { localizedPlayerName } from "@/lib/org/display-name";
import type { EligibleChild } from "@/lib/org/session-queries";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type ClaimFormProps = {
  childrenOptions: EligibleChild[];
  packages: SessionPackage[];
  locale: string;
  transferHint: string;
};

export function ClaimForm({
  childrenOptions,
  packages,
  locale,
  transferHint,
}: ClaimFormProps) {
  const t = useTranslations("credits");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    submitPaymentClaim,
    INITIAL_ORG_ACTION_STATE,
  );

  if (childrenOptions.length === 0) {
    return <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("buyEmpty")}</p>;
  }

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("selectChild")}
        <select
          name="player_id"
          required
          defaultValue={childrenOptions.length === 1 ? childrenOptions[0].player.id : ""}
          className={inputClassName}
        >
          {childrenOptions.length > 1 ? <option value="">{t("selectChild")}</option> : null}
          {childrenOptions.map((child) => (
            <option key={child.player.id} value={child.player.id}>
              {localizedPlayerName(child.player, locale)} · {child.teamName} · #{child.jerseyNumber}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("selectPackage")}
        <select name="package_id" required defaultValue="" className={inputClassName}>
          <option value="">{t("selectPackage")}</option>
          {packages.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {t(`bands.${pkg.age_band}`)} · {t("creditsCount", { count: pkg.credits })} ·{" "}
              {t("priceTwd", { amount: pkg.price_twd })}
            </option>
          ))}
        </select>
        <span className="font-normal text-zinc-500">{t("packageHint")}</span>
      </label>
      <div className="rounded-xl bg-zinc-100 px-4 py-3 text-sm leading-6 dark:bg-zinc-800">
        <p className="font-medium">{t("transferTitle")}</p>
        <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
          {transferHint || t("transferHintMissing")}
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("last5")}
        <input
          name="last5"
          required
          inputMode="numeric"
          maxLength={5}
          pattern="[0-9]{5}"
          className={inputClassName}
        />
        <span className="font-normal text-zinc-500">{t("last5Hint")}</span>
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? t("submitting") : t("submitClaim")}
      </button>
    </form>
  );
}
