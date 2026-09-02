"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { assignCoachTeam, unassignCoachTeam, updateCoachStatus } from "@/lib/org/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { Coach, Team } from "@/lib/supabase/database.types";
import { dangerButtonClassName, inputClassName, primaryButtonClassName } from "@/lib/ui";

type Assignment = {
  id: string;
  team: Pick<Team, "id" | "name" | "age_band"> | null;
};

type CoachTeamsFormProps = {
  coach: Pick<Coach, "id" | "status">;
  assignments: Assignment[];
  teams: Pick<Team, "id" | "name" | "age_band" | "status">[];
};

export function CoachTeamsForm({ coach, assignments, teams }: CoachTeamsFormProps) {
  const t = useTranslations("org");
  const updateStatus = updateCoachStatus.bind(null, coach.id);
  const assignTeam = assignCoachTeam.bind(null, coach.id);
  const [statusState, statusAction, statusPending] = useActionState(
    updateStatus,
    INITIAL_ORG_ACTION_STATE,
  );
  const [assignState, assignAction, assignPending] = useActionState(
    assignTeam,
    INITIAL_ORG_ACTION_STATE,
  );

  const assignedIds = new Set(assignments.map((item) => item.team?.id).filter(Boolean));
  const availableTeams = teams.filter((team) => !assignedIds.has(team.id));

  return (
    <div className="flex flex-col gap-8">
      <form action={statusAction} className="flex max-w-xl flex-col gap-4">
        <LocaleHiddenField />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("status")}
          <select
            name="status"
            defaultValue={coach.status}
            className={inputClassName}
          >
            <option value="active">{t("statusActive")}</option>
            <option value="inactive">{t("statusInactive")}</option>
          </select>
        </label>
        {statusState.errorKey ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {t(`errors.${statusState.errorKey}`)}
          </p>
        ) : null}
        <button type="submit" disabled={statusPending} className={primaryButtonClassName}>
          {statusPending ? t("saving") : t("saveStatus")}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t("assignedTeams")}</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("noAssignedTeams")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {assignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span>
                  {assignment.team
                    ? `${assignment.team.name} (${t(`ageBands.${assignment.team.age_band}`)})`
                    : t("unknownTeam")}
                </span>
                <form action={unassignCoachTeam}>
                  <LocaleHiddenField />
                  <input type="hidden" name="assignment_id" value={assignment.id} />
                  <input type="hidden" name="coach_id" value={coach.id} />
                  <button type="submit" className={dangerButtonClassName}>
                    {t("unassign")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={assignAction} className="flex max-w-xl flex-col gap-4">
        <LocaleHiddenField />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("assignTeam")}
          <select
            name="team_id"
            required
            defaultValue=""
            disabled={availableTeams.length === 0}
            className={inputClassName}
          >
            <option value="">{t("selectTeam")}</option>
            {availableTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({t(`ageBands.${team.age_band}`)})
              </option>
            ))}
          </select>
        </label>
        {assignState.errorKey ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {t(`errors.${assignState.errorKey}`)}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={assignPending || availableTeams.length === 0}
          className={primaryButtonClassName}
        >
          {assignPending ? t("saving") : t("assign")}
        </button>
      </form>
    </div>
  );
}
