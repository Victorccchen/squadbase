"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { regenerateVenueToken } from "@/lib/venues/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { dangerButtonClassName } from "@/lib/ui";

export function RegenerateTokenForm({ venueId }: { venueId: string }) {
  const t = useTranslations("venues");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(regenerateVenueToken, INITIAL_ORG_ACTION_STATE);

  return (
    <form
      action={formAction}
      className="flex flex-col items-start gap-2"
      onSubmit={(event) => {
        if (!window.confirm(t("regenerateConfirm"))) {
          event.preventDefault();
        }
      }}
    >
      <LocaleHiddenField />
      <input type="hidden" name="venue_id" value={venueId} />
      <button type="submit" disabled={pending} className={dangerButtonClassName}>
        {pending ? org("saving") : t("regenerate")}
      </button>
      {state.errorKey ? (
        <p role="alert" className="text-sm text-red-800 dark:text-red-200">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
    </form>
  );
}
