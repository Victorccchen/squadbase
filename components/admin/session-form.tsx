"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { Team, TrainingSession } from "@/lib/supabase/database.types";
import { toDateTimeLocalInput } from "@/lib/org/session-time";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type SessionFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  teams: Pick<Team, "id" | "name" | "age_band" | "status">[];
  session?: Pick<TrainingSession, "team_id" | "starts_at" | "ends_at" | "location" | "notes" | "status">;
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
  const activeTeams = teams.filter((team) => team.status === "active" || team.id === session?.team_id);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
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