"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { SessionKind, Team, TrainingSession } from "@/lib/supabase/database.types";
import { SESSION_KINDS, isRecurringSessionKind } from "@/lib/org/session-recurrence";
import { toDateTimeLocalInput } from "@/lib/org/session-time";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type SessionFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  teams: Pick<Team, "id" | "name" | "age_band" | "status">[];
  session?: Pick<
    TrainingSession,
    | "team_id"
    | "title"
    | "kind"
    | "starts_at"
    | "ends_at"
    | "location"
    | "notes"
    | "status"
    | "is_playoff"
  >;
  lockTeam?: boolean;
  submitLabel: string;
};

export function SessionForm({
  action,
  teams,
  session,
  lockTeam = false,
  submitLabel,
}: SessionFormProps) {
  const t = useTranslations("sessions");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  const isEdit = Boolean(session);
  const [kind, setKind] = useState<SessionKind>(session?.kind ?? "regular");
  const [untilDate, setUntilDate] = useState("");
  const [weekCount, setWeekCount] = useState("");
  const activeTeams = teams.filter((team) => team.status === "active" || team.id === session?.team_id);
  const showRecurrence = !isEdit && isRecurringSessionKind(kind);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("sessionTitle")}
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={session?.title ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {org("team")}
        <select
          name="team_id"
          required
          defaultValue={session?.team_id ?? ""}
          disabled={lockTeam}
          className={inputClassName}
        >
          <option value="">{org("selectTeam")}</option>
          {activeTeams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      {lockTeam && session ? <input type="hidden" name="team_id" value={session.team_id} /> : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("kind")}
        {isEdit ? (
          <>
            <input type="hidden" name="kind" value={session?.kind ?? kind} />
            <p className="rounded-xl border border-zinc-200 px-3 py-2.5 text-base font-normal dark:border-zinc-700">
              {t(`kinds.${session?.kind ?? kind}`)}
            </p>
          </>
        ) : (
          <select
            name="kind"
            required
            value={kind}
            onChange={(event) => setKind(event.target.value as SessionKind)}
            className={inputClassName}
          >
            {SESSION_KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`kinds.${value}`)}
              </option>
            ))}
          </select>
        )}
      </label>
      {isEdit && session?.kind === "league" ? (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="is_playoff"
            value="true"
            defaultChecked={session.is_playoff}
          />
          {t("playoffFlag")}
        </label>
      ) : null}
      {isEdit && session?.kind === "league" ? (
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("playoffHint")}</p>
      ) : null}
      {!isEdit && kind === "league" ? (
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("playoffCreateHint")}</p>
      ) : null}
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("timeZoneHint")}</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("startsAt")}
        <input
          type="datetime-local"
          name="starts_at"
          required
          defaultValue={session ? toDateTimeLocalInput(session.starts_at) : ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("endsAt")}
        <input
          type="datetime-local"
          name="ends_at"
          defaultValue={session ? toDateTimeLocalInput(session.ends_at) : ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("durationMinutes")}
        <input
          name="duration_minutes"
          inputMode="numeric"
          placeholder="90"
          className={inputClassName}
        />
      </label>
      {showRecurrence ? (
        <fieldset className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <legend className="px-1 text-sm font-medium">{t("recurrenceLegend")}</legend>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("recurrenceHint")}</p>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("untilDate")}
            <input
              type="date"
              name="until_date"
              value={untilDate}
              onChange={(event) => {
                setUntilDate(event.target.value);
                if (event.target.value) {
                  setWeekCount("");
                }
              }}
              className={inputClassName}
            />
          </label>
          <p className="text-center text-xs font-medium uppercase tracking-wide text-zinc-500">
            {t("recurrenceOr")}
          </p>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("weekCount")}
            <input
              name="week_count"
              inputMode="numeric"
              value={weekCount}
              onChange={(event) => {
                setWeekCount(event.target.value);
                if (event.target.value) {
                  setUntilDate("");
                }
              }}
              placeholder="4"
              className={inputClassName}
            />
          </label>
        </fieldset>
      ) : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("location")}
        <input
          name="location"
          maxLength={200}
          defaultValue={session?.location ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("notes")}
        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          defaultValue={session?.notes ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {org("status")}
        <select
          name="status"
          defaultValue={session?.status ?? "active"}
          className={inputClassName}
        >
          <option value="active">{org("statusActive")}</option>
          <option value="inactive">{org("statusInactive")}</option>
        </select>
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : submitLabel}
      </button>
    </form>
  );
}
