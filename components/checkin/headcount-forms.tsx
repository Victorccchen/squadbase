"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { confirmHeadcount, removeCheckin, setSessionVenue } from "@/lib/checkin/staff-actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import {
  inputClassName,
  primaryButtonClassName,
  quietButtonClassName,
  secondaryButtonClassName,
} from "@/lib/ui";

function ErrorLine({ errorKey }: { errorKey: string | null }) {
  const org = useTranslations("org");
  return errorKey ? (
    <p role="alert" className="text-sm text-red-800 dark:text-red-200">
      {org(`errors.${errorKey}`)}
    </p>
  ) : null;
}

export function HeadcountForm({ sessionId, initial }: { sessionId: string; initial: number | null }) {
  const t = useTranslations("checkin");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(confirmHeadcount, INITIAL_ORG_ACTION_STATE);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <LocaleHiddenField />
      <input type="hidden" name="session_id" value={sessionId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("headcountLabel")}
        <input
          name="headcount"
          type="number"
          inputMode="numeric"
          min={0}
          max={500}
          required
          defaultValue={initial ?? ""}
          className={`${inputClassName} w-28`}
        />
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : t("headcountConfirm")}
      </button>
      <ErrorLine errorKey={state.errorKey} />
    </form>
  );
}

export function RemoveCheckinForm({ sessionId, playerId }: { sessionId: string; playerId: string }) {
  const t = useTranslations("checkin");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(removeCheckin, INITIAL_ORG_ACTION_STATE);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="player_id" value={playerId} />
      <input
        name="reason"
        required
        minLength={2}
        maxLength={300}
        placeholder={t("removeReason")}
        className={`${inputClassName} w-48`}
      />
      <button type="submit" disabled={pending} className={quietButtonClassName}>
        {pending ? org("saving") : t("remove")}
      </button>
      <ErrorLine errorKey={state.errorKey} />
    </form>
  );
}

export function SessionVenueForm({
  sessionId,
  venueId,
  venues,
  inSeries,
}: {
  sessionId: string;
  venueId: string | null;
  venues: { id: string; name: string; active: boolean }[];
  inSeries: boolean;
}) {
  const t = useTranslations("checkin");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(setSessionVenue, INITIAL_ORG_ACTION_STATE);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <LocaleHiddenField />
      <input type="hidden" name="session_id" value={sessionId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("venueLabel")}
        <select name="venue_id" defaultValue={venueId ?? ""} className={inputClassName}>
          <option value="">{t("venueNone")}</option>
          {venues
            .filter((venue) => venue.active || venue.id === venueId)
            .map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
        </select>
      </label>
      {inSeries ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="whole_series" value="true" defaultChecked />
          {t("venueWholeSeries")}
        </label>
      ) : null}
      <button type="submit" disabled={pending} className={secondaryButtonClassName}>
        {pending ? org("saving") : t("venueSave")}
      </button>
      <ErrorLine errorKey={state.errorKey} />
    </form>
  );
}
