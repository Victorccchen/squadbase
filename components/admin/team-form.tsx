"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { AGE_BANDS } from "@/lib/age-band";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { AgeBand, Team } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type TeamFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  team?: Pick<Team, "name" | "age_band" | "status">;
  submitLabel: string;
};

export function TeamForm({ action, team, submitLabel }: TeamFormProps) {
  const t = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("teamName")}
        <input
          name="name"
          required
          defaultValue={team?.name ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("ageBand")}
        <select
          name="age_band"
          required
          defaultValue={team?.age_band ?? "U12"}
          className={inputClassName}
        >
          {AGE_BANDS.map((band) => (
            <option key={band} value={band}>
              {t(`ageBands.${band}` as `ageBands.${AgeBand}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("status")}
        <select
          name="status"
          defaultValue={team?.status ?? "active"}
          className={inputClassName}
        >
          <option value="active">{t("statusActive")}</option>
          <option value="inactive">{t("statusInactive")}</option>
        </select>
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {t(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? t("saving") : submitLabel}
      </button>
    </form>
  );
}
