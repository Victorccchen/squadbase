import { useTranslations } from "next-intl";
import type { OrgActionState } from "@/lib/org/errors";
import type { Team } from "@/lib/supabase/database.types";

type TeamCreateResultsProps = {
  state: OrgActionState;
  teams: Pick<Team, "id" | "name">[];
};

export function TeamCreateResults({ state, teams }: TeamCreateResultsProps) {
  const org = useTranslations("org");
  const admin = useTranslations("admin");
  const results = state.teamResults ?? [];
  const nameById = new Map(teams.map((team) => [team.id, team.name]));

  if (results.length > 0) {
    const anyOk = results.some((row) => row.ok);
    const allOk = results.every((row) => row.ok);
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100"
      >
        {anyOk && !allOk ? (
          <p>{org("errors.partialTeamCreates")}</p>
        ) : anyOk ? null : (
          <p>{admin("multiTeamNone")}</p>
        )}
        <ul className="grid gap-1 font-normal">
          {results.map((row) => (
            <li key={row.teamId} className="flex flex-wrap justify-between gap-2">
              <span>{nameById.get(row.teamId) ?? org("unknownTeam")}</span>
              <span>
                {row.ok
                  ? admin("multiTeamRowOk")
                  : row.errorKey
                    ? org(`errors.${row.errorKey}`)
                    : org("errors.generic")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (state.errorKey) {
    return (
      <p
        role="alert"
        className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100"
      >
        {org(`errors.${state.errorKey}`)}
      </p>
    );
  }

  return null;
}
