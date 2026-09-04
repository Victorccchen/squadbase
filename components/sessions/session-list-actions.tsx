"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import {
  cancelSessionRegistration,
  registerForSession,
} from "@/lib/org/session-actions";
import { INITIAL_ORG_ACTION_STATE, type OrgErrorKey } from "@/lib/org/errors";
import { isGuardianCancelLocked } from "@/lib/org/session-time";
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

function RegisterButton({ sessionId, playerId }: { sessionId: string; playerId: string }) {
  const t = useTranslations("sessions");
  const [state, formAction, pending] = useActionState(
    registerForSession,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="player_id" value={playerId} />
      <input type="hidden" name="return_to" value="list" />
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
}: {
  registrationId: string;
  sessionId: string;
}) {
  const t = useTranslations("sessions");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    cancelSessionRegistration,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <LocaleHiddenField />
      <input type="hidden" name="registration_id" value={registrationId} />
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="return_to" value="list" />
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
  registrationId: string | null;
  showRegisteredLabel?: boolean;
};

export function SessionListActions({
  sessionId,
  playerId,
  startsAt,
  registrationId,
  showRegisteredLabel = true,
}: SessionListActionsProps) {
  const t = useTranslations("sessions");

  if (!registrationId) {
    return <RegisterButton sessionId={sessionId} playerId={playerId} />;
  }

  const locked = isGuardianCancelLocked(startsAt);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {showRegisteredLabel ? (
        <span className={mutedLabelClassName}>{t("statuses.registered")}</span>
      ) : null}
      {locked ? (
        <span className={mutedLabelClassName}>{t("cannotCancel")}</span>
      ) : (
        <CancelButton registrationId={registrationId} sessionId={sessionId} />
      )}
    </div>
  );
}
