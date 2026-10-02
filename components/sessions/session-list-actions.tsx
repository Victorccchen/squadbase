"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import {
  cancelSessionRegistration,
  registerForSession,
} from "@/lib/org/session-actions";
import { INITIAL_ORG_ACTION_STATE, type OrgErrorKey } from "@/lib/org/errors";
import { isLateCancel } from "@/lib/credits/debit-rules";
import { hasSessionStarted } from "@/lib/org/session-time";
import type { SessionKind } from "@/lib/supabase/database.types";
import {
  mutedLabelClassName,
  primaryButtonClassName,
  quietButtonClassName,
} from "@/lib/ui";

function ActionError({ errorKey }: { errorKey: OrgErrorKey }) {
  const org = useTranslations("org");
  return (
    <p role="alert" className="max-w-[16rem] text-right text-sm text-red-800 dark:text-red-200">
      {org(`errors.${errorKey}`)}
    </p>
  );
}

function ReturnFields({
  returnTo,
  seriesId,
  groupKey,
}: {
  returnTo: string;
  seriesId?: string;
  groupKey?: string;
}) {
  return (
    <>
      <input type="hidden" name="return_to" value={returnTo} />
      {seriesId ? <input type="hidden" name="series_id" value={seriesId} /> : null}
      {groupKey ? <input type="hidden" name="group_key" value={groupKey} /> : null}
    </>
  );
}

function RegisterButton({
  sessionId,
  playerId,
  returnTo,
  seriesId,
  groupKey,
}: {
  sessionId: string;
  playerId: string;
  returnTo: string;
  seriesId?: string;
  groupKey?: string;
}) {
  const t = useTranslations("sessions");
  const [state, formAction, pending] = useActionState(
    registerForSession,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <LocaleHiddenField />
      <ReturnFields returnTo={returnTo} seriesId={seriesId} groupKey={groupKey} />
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="player_id" value={playerId} />
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? t("registering") : t("register")}
      </button>
      {state.errorKey ? <ActionError errorKey={state.errorKey} /> : null}
    </form>
  );
}

function CancelButton({
  registrationId,
  sessionId,
  returnTo,
  seriesId,
  groupKey,
  confirmMessage,
}: {
  registrationId: string;
  sessionId: string;
  returnTo: string;
  seriesId?: string;
  groupKey?: string;
  /** PR-06: shown before a late cancel that will be debited. */
  confirmMessage: string | null;
}) {
  const t = useTranslations("sessions");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    cancelSessionRegistration,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col items-end gap-2"
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <LocaleHiddenField />
      <ReturnFields returnTo={returnTo} seriesId={seriesId} groupKey={groupKey} />
      <input type="hidden" name="registration_id" value={registrationId} />
      <input type="hidden" name="session_id" value={sessionId} />
      <button type="submit" disabled={pending} className={quietButtonClassName}>
        {pending ? org("saving") : t("cancel")}
      </button>
      {state.errorKey ? <ActionError errorKey={state.errorKey} /> : null}
    </form>
  );
}

type SessionListActionsProps = {
  sessionId: string;
  playerId: string;
  startsAt: string;
  kind: SessionKind;
  /** Credits a late cancel costs (special/match within 24 hours). */
  lateCancelCredits: number;
  registrationId: string | null;
  showRegisteredLabel?: boolean;
  returnTo?: string;
  seriesId?: string;
  groupKey?: string;
};

export function SessionListActions({
  sessionId,
  playerId,
  startsAt,
  kind,
  lateCancelCredits,
  registrationId,
  showRegisteredLabel = true,
  returnTo = "sessions",
  seriesId,
  groupKey,
}: SessionListActionsProps) {
  const t = useTranslations("sessions");

  if (!registrationId) {
    return (
      <RegisterButton
        sessionId={sessionId}
        playerId={playerId}
        returnTo={returnTo}
        seriesId={seriesId}
        groupKey={groupKey}
      />
    );
  }

  // PR-06: parents may cancel until the start. Special sessions and matches
  // within 24 hours become a late cancel, debited like a no-show.
  const started = hasSessionStarted(startsAt);
  const confirmMessage =
    isLateCancel({ kind, startsAt }) && lateCancelCredits > 0
      ? t("lateCancelConfirm", { count: lateCancelCredits })
      : null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {showRegisteredLabel ? (
        <span className={mutedLabelClassName}>{t("statuses.registered")}</span>
      ) : null}
      {started ? (
        <span className={mutedLabelClassName}>{t("cannotCancel")}</span>
      ) : (
        <CancelButton
          registrationId={registrationId}
          sessionId={sessionId}
          returnTo={returnTo}
          seriesId={seriesId}
          groupKey={groupKey}
          confirmMessage={confirmMessage}
        />
      )}
    </div>
  );
}
