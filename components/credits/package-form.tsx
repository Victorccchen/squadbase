"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { upsertSessionPackage } from "@/lib/credits/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { SessionPackage } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";

type PackageRowFormProps = {
  pkg: SessionPackage;
};

export function PackageRowForm({ pkg }: PackageRowFormProps) {
  const t = useTranslations("credits");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    upsertSessionPackage,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <LocaleHiddenField />
      <input type="hidden" name="package_id" value={pkg.id} />
      <input type="hidden" name="age_band" value={pkg.age_band} />
      <input type="hidden" name="credits" value={String(pkg.credits)} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("priceTwdLabel")}
        <input
          name="price_twd"
          required
          inputMode="numeric"
          defaultValue={pkg.price_twd}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {org("status")}
        <select name="active" defaultValue={pkg.active ? "true" : "false"} className={inputClassName}>
          <option value="true">{org("statusActive")}</option>
          <option value="false">{org("statusInactive")}</option>
        </select>
      </label>
      {state.errorKey ? (
        <p role="alert" className="w-full rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={secondaryButtonClassName}>
        {pending ? org("saving") : t("savePackage")}
      </button>
    </form>
  );
}

export function NewPackageForm() {
  const t = useTranslations("credits");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    upsertSessionPackage,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-3">
      <LocaleHiddenField />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("catalogBand")}
        <select name="age_band" required defaultValue="U8" className={inputClassName}>
          <option value="U8">{t("bands.U8")}</option>
          <option value="U10_U18">{t("bands.U10_U18")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("packageCredits")}
        <input name="credits" required inputMode="numeric" className={inputClassName} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("priceTwdLabel")}
        <input name="price_twd" required inputMode="numeric" className={inputClassName} />
      </label>
      <input type="hidden" name="active" value="true" />
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : t("addPackage")}
      </button>
    </form>
  );
}
