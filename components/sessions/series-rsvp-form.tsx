"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { bulkCancelForSeries, bulkRegisterForSeries } from "@/lib/org/session-actions";
import {
  INITIAL_BULK_RSVP_STATE,
  type BulkRsvpState,
  type OrgErrorKey,
} from "@/lib/org/errors";
import { formatClubDateWithWeekday } from "@/lib/org/session-time";
import { inputClassName, primaryButtonClassName, quietButtonClassName } from "@/lib/ui";

type SeriesChild = {
  playerId: string;
  playerName: string;
};

type SeriesRsvpFormProps = {
  childrenOnTeam: SeriesChild[];
  seriesId?: string;
  groupKey?: string;
  locale: string;
};

function BulkError({ errorKey }: { errorKey: OrgErrorKey }) {
  const org = useTranslations("org");
  return <span>{org(`errors.${errorKey}`)}</span>;
}

function BulkResultList({ state, locale }: { state: BulkRsvpState; locale: string }) {
  const t = useTranslations("competitions");
  if (!state.attempted) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {state.errorKey ? (
        <p role="alert" className="text-sm text-red-800 dark:text-red-200">
          <BulkError errorKey={state.errorKey} />
        </p>
      ) : null}
      {state.results.length > 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {state.ok && state.results.some((row) => !row.ok)
            ? t("bulkPartial")
            : state.ok
              ? t("bulkAllOk")
              : t("bulkNone")}
        </p>
      ) : null}
      {state.results.length > 0 ? (
        <ul className="grid gap-1 text-sm">
          {state.results.map((row) => (
            <li key={row.sessionId} className="flex flex-wrap justify-between gap-2">
              <span>{formatClubDateWithWeekday(row.startsAt, locale)}</span>
              <span className={row.ok ? "text-emerald-800 dark:text-emerald-200" : "text-zinc-500"}>
                {row.ok ? (
                  t("bulkRowOk")
                ) : row.errorKey ? (
                  <BulkError errorKey={row.errorKey} />
                ) : (
                  t("bulkRowSkipped")
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ScopeFields({
  playerId,
  seriesId,
  groupKey,
}: {
  playerId: string;
  seriesId?: string;
  groupKey?: string;
}) {
  return (
    <>
      <LocaleHiddenField />
      {seriesId ? <input type="hidden" name="series_id" value={seriesId} /> : null}
      {groupKey ? <input type="hidden" name="group_key" value={groupKey} /> : null}
      <input type="hidden" name="player_id" value={playerId} />
    </>
  );
}

export function SeriesRsvpForm({
  childrenOnTeam,
  seriesId,
  groupKey,
  locale,
}: SeriesRsvpFormProps) {
  const t = useTranslations("competitions");
  const sessionsT = useTranslations("sessions");
  const [playerId, setPlayerId] = useState(childrenOnTeam[0]?.playerId ?? "");
  const [registerState, registerAction, registerPending] = useActionState(
    bulkRegisterForSeries,
    INITIAL_BULK_RSVP_STATE,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    bulkCancelForSeries,
    INITIAL_BULK_RSVP_STATE,
  );

  if (childrenOnTeam.length === 0) {
    return <p className="text-sm text-zinc-500">{sessionsT("noEligibleChild")}</p>;
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <label className="flex max-w-sm flex-col gap-1.5 text-sm font-medium">
        {t("selectChild")}
        <select
          value={playerId}
          onChange={(event) => setPlayerId(event.target.value)}
          className={inputClassName}
        >
          {childrenOnTeam.map((child) => (
            <option key={child.playerId} value={child.playerId}>
              {child.playerName}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <form action={registerAction}>
          <ScopeFields playerId={playerId} seriesId={seriesId} groupKey={groupKey} />
          <button
            type="submit"
            disabled={registerPending || !playerId}
            className={primaryButtonClassName}
          >
            {registerPending ? sessionsT("registering") : t("attendSeries")}
          </button>
        </form>
        <form action={cancelAction}>
          <ScopeFields playerId={playerId} seriesId={seriesId} groupKey={groupKey} />
          <button
            type="submit"
            disabled={cancelPending || !playerId}
            className={quietButtonClassName}
          >
            {cancelPending ? t("cancellingSeries") : t("cancelSeries")}
          </button>
        </form>
      </div>
      <BulkResultList state={registerState} locale={locale} />
      <BulkResultList state={cancelState} locale={locale} />
    </div>
  );
}
