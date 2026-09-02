"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { Profile } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type CoachLinkFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  profiles: Profile[];
};

export function CoachLinkForm({ action, profiles }: CoachLinkFormProps) {
  const t = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);

  if (profiles.length === 0) {
    return <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("noLinkableProfiles")}</p>;
  }

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("profile")}
        <select name="profile_id" required defaultValue="" className={inputClassName}>
          <option value="">{t("selectProfile")}</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.display_name || profile.phone || profile.id}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm leading-6 text-zinc-500">{t("linkCoachHint")}</p>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {t(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? t("saving") : t("linkCoach")}
      </button>
    </form>
  );
}
