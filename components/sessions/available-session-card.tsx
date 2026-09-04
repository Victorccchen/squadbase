"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RegisterFormFields } from "@/components/sessions/register-form";
import {
  SessionKindBadge,
  SessionPlayoffBadge,
  SessionStatusBadge,
} from "@/components/sessions/session-status-badge";
import { registerForSession } from "@/lib/org/session-actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { EligibleChild } from "@/lib/org/session-queries";
import type { SessionKind } from "@/lib/supabase/database.types";
import { formatClubDateTimeRange } from "@/lib/org/session-time";
import { primaryButtonClassName } from "@/lib/ui";

type AvailableSessionCardProps = {
  sessionId: string;
  title: string;
  teamName: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  kind: SessionKind;
  isPlayoff: boolean;
  childrenOptions: EligibleChild[];
  locale: string;
};

export function AvailableSessionCard({
  sessionId,
  title,
  teamName,
  location,
  startsAt,
  endsAt,
  kind,
  isPlayoff,
  childrenOptions,
  locale,
}: AvailableSessionCardProps) {
  const t = useTranslations("sessions");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(
    registerForSession,
    INITIAL_ORG_ACTION_STATE,
  );
  const formId = `register-${sessionId}`;
  const canSubmit = childrenOptions.length > 0;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{title}</span>
            <span className="flex flex-wrap items-center gap-2">
              <SessionKindBadge kind={kind} label={t(`kinds.${kind}`)} />
              {isPlayoff ? <SessionPlayoffBadge label={t("playoff")} /> : null}
              <SessionStatusBadge status="active" label={org("statusActive")} />
            </span>
          </div>
          <p className="text-sm text-zinc-500">
            {teamName}
            {" · "}
            {formatClubDateTimeRange(startsAt, endsAt, locale)}
          </p>
          {location ? <p className="text-sm text-zinc-500">{location}</p> : null}
          <Link
            href={`/app/sessions/${sessionId}`}
            className="text-sm font-medium underline underline-offset-2"
          >
            {t("viewSession")}
          </Link>
        </div>
        <button
          type="submit"
          form={canSubmit ? formId : undefined}
          disabled={pending || !canSubmit}
          className={primaryButtonClassName}
        >
          {pending ? t("registering") : t("register")}
        </button>
      </div>
      <RegisterFormFields
        sessionId={sessionId}
        childrenOptions={childrenOptions}
        locale={locale}
        returnTo="list"
        formId={formId}
        hideSubmit
        formAction={formAction}
        state={state}
        pending={pending}
      />
    </li>
  );
}
