"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { Team } from "@/lib/supabase/database.types";
import { MATCH_KINDS, MAX_BULK_MATCHES } from "@/lib/org/match";
import { inputClassName, primaryButtonClassName, quietButtonClassName } from "@/lib/ui";

type BulkMatchFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  teams: Pick<Team, "id" | "name" | "age_band" | "status">[];
  submitLabel: string;
};

export function BulkMatchForm({ action, teams, submitLabel }: BulkMatchFormProps) {
  const t = useTranslations("matches");
  const sessionsT = useTranslations("sessions");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  const [kind, setKind] = useState<(typeof MATCH_KINDS)[number]>("league");
  const [kickoffCount, setKickoffCount] = useState(4);
  const activeTeams = teams.filter((team) => team.status === "active");

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("bulkLead")}</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("titleLabel")}
        <input name="title" required maxLength={200} className={inputClassName} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {org("team")}
        <select name="team_id" required className={inputClassName}>
          <option value="">{org("selectTeam")}</option>
          {activeTeams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {sessionsT("kind")}
        <select
          name="kind"
          required
          value={kind}
          onChange={(event) => setKind(event.target.value === "cup" ? "cup" : "league")}
          className={inputClassName}
        >
          {MATCH_KINDS.map((value) => (
            <option key={value} value={value}>
              {sessionsT(`kinds.${value}`)}
            </option>
          ))}
        </select>
      </label>
      {kind === "league" ? (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="is_playoff" value="true" />
          {sessionsT("playoffFlag")}
        </label>
      ) : null}
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {sessionsT("timeZoneHint")}
      </p>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t("bulkKickoffs")}</legend>
        <p className="text-sm leading-6 font-normal text-zinc-600 dark:text-zinc-300">
          {t("bulkCountHint", { max: MAX_BULK_MATCHES })}
        </p>
        {Array.from({ length: kickoffCount }, (_, index) => (
          <label key={index} className="flex flex-col gap-1.5 text-sm font-medium">
            {t("kickoff")} {index + 1}
            <input type="datetime-local" name="kickoffs" className={inputClassName} />
          </label>
        ))}
        <button
          type="button"
          className={quietButtonClassName}
          disabled={kickoffCount >= MAX_BULK_MATCHES}
          onClick={() => setKickoffCount((count) => Math.min(MAX_BULK_MATCHES, count + 1))}
        >
          {t("addKickoff")}
        </button>
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {sessionsT("durationMinutes")}
        <input
          name="duration_minutes"
          inputMode="numeric"
          placeholder="90"
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("venue")}
        <input name="location" maxLength={200} className={inputClassName} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("opponent")}
        <input
          name="opponent"
          maxLength={200}
          placeholder={t("opponentTbd")}
          className={inputClassName}
        />
      </label>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("opponentHint")}</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("side")}
        <select name="side" defaultValue="home" className={inputClassName}>
          <option value="home">{t("sides.home")}</option>
          <option value="away">{t("sides.away")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {sessionsT("notes")}
        <textarea name="notes" rows={3} maxLength={1000} className={inputClassName} />
      </label>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("notesPrivateHint")}</p>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="is_published" value="true" />
        {t("publishNow")}
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
