"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { saveVenue } from "@/lib/venues/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type VenueFormProps = {
  venue?: { id: string; name: string; address: string | null; active: boolean };
};

export function VenueForm({ venue }: VenueFormProps) {
  const t = useTranslations("venues");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(saveVenue, INITIAL_ORG_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <LocaleHiddenField />
      {venue ? <input type="hidden" name="venue_id" value={venue.id} /> : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("name")}
        <input name="name" required maxLength={120} defaultValue={venue?.name ?? ""} className={inputClassName} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("address")}
        <input name="address" maxLength={300} defaultValue={venue?.address ?? ""} className={inputClassName} />
      </label>
      {venue ? (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="hidden" name="active" value="false" />
          <input type="checkbox" name="active" value="true" defaultChecked={venue.active} />
          {t("active")}
        </label>
      ) : null}
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : venue ? t("save") : t("create")}
      </button>
    </form>
  );
}
