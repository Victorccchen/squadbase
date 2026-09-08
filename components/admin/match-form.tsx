"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { MatchPublication, Team, TrainingSession } from "@/lib/supabase/database.types";
import { MATCH_KINDS, parseMatchKind } from "@/lib/org/match";
import { toDateTimeLocalInput } from "@/lib/org/session-time";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type MatchFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  teams: Pick<Team, "id" | "name" | "age_band" | "status">[];
  session?: Pick<
    TrainingSession,
    "team_id" | "title" | "kind" | "starts_at" | "ends_at" | "location" | "notes" | "is_playoff"
  >;
  publication?: Pick<MatchPublication, "opponent" | "side" | "is_published">;
  submitLabel: string;
};

export function MatchForm({
  action,
  teams,
  session,
  publication,
  submitLabel,
}: MatchFormProps) {
  const t = useTranslations("matches");
  const sessionsT = useTranslations("sessions");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  const isEdit = Boolean(session);
  const [kind, setKind] = useState<(typeof MATCH_KINDS)[number]>(
    parseMatchKind(session?.kind ?? "") ?? "cup",
  );
  const activeTeams = teams.filter(
    (team) => team.status === "active" || team.id === session?.team_id,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("titleLabel")}
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
          disabled={isEdit}
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
      {isEdit && session ? <input type="hidden" name="team_id" value={session.team_id} /> : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {sessionsT("kind")}
        {isEdit ? (
          <>
            <input type="hidden" name="kind" value={kind} />
            <p className="rounded-xl border border-zinc-200 px-3 py-2.5 text-base font-normal dark:border-zinc-700">
              {sessionsT(`kinds.${kind}`)}
            </p>
          </>
        ) : (
          <select
            name="kind"
            required
            value={kind}
            onChange={(event) => {
              const parsed = parseMatchKind(event.target.value);
              if (parsed) {
                setKind(parsed);
              }
            }}
            className={inputClassName}
          >
            {MATCH_KINDS.map((value) => (
              <option key={value} value={value}>
                {sessionsT(`kinds.${value}`)}
              </option>
            ))}
          </select>
        )}
      </label>
      {kind === "league" ? (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="is_playoff"
            value="true"
            defaultChecked={session?.is_playoff ?? false}
          />
          {sessionsT("playoffFlag")}
        </label>
      ) : null}
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {sessionsT("timeZoneHint")}
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("kickoff")}
        <input
          type="datetime-local"
          name="starts_at"
          required
          defaultValue={session ? toDateTimeLocalInput(session.starts_at) : ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {sessionsT("endsAt")}
        <input
          type="datetime-local"
          name="ends_at"
          defaultValue={session ? toDateTimeLocalInput(session.ends_at) : ""}
          className={inputClassName}
        />
      </label>
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
        <input
          name="location"
          maxLength={200}
          defaultValue={session?.location ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("opponent")}
        <input
          name="opponent"
          maxLength={200}
          defaultValue={publication?.opponent ?? ""}
          placeholder={t("opponentTbd")}
          className={inputClassName}
        />
      </label>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("opponentHint")}</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("side")}
        <select
          name="side"
          defaultValue={publication?.side ?? "home"}
          className={inputClassName}
        >
          <option value="home">{t("sides.home")}</option>
          <option value="away">{t("sides.away")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {sessionsT("notes")}
        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          defaultValue={session?.notes ?? ""}
          className={inputClassName}
        />
      </label>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("notesPrivateHint")}</p>
      {!isEdit ? (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="is_published"
            value="true"
            defaultChecked={publication?.is_published ?? false}
          />
          {t("publishNow")}
        </label>
      ) : null}
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
