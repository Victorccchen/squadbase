"use client";

import { useTranslations } from "next-intl";
import { SESSION_KINDS } from "@/lib/org/session-recurrence";
import { formatYearMonth, type AdminSessionsQuery } from "@/lib/org/session-calendar";
import { secondaryButtonClassName } from "@/lib/ui";
import type { Team } from "@/lib/supabase/database.types";

type SessionListFiltersFormProps = {
  query: AdminSessionsQuery;
  teams: Pick<Team, "id" | "name" | "age_band">[];
};

export function SessionListFiltersForm({ query, teams }: SessionListFiltersFormProps) {
  const t = useTranslations("admin");
  const sessionsT = useTranslations("sessions");
  const org = useTranslations("org");

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      method="get"
    >
      <input type="hidden" name="month" value={formatYearMonth(query.year, query.month)} />
      <input type="hidden" name="day" value={query.day} />
      {query.view === "list" ? <input type="hidden" name="view" value="list" /> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{sessionsT("kind")}</legend>
        <div className="flex flex-wrap gap-3">
          {SESSION_KINDS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="kind"
                value={value}
                defaultChecked={query.kinds.includes(value)}
              />
              {sessionsT(`kinds.${value}`)}
            </label>
          ))}
        </div>
        <p className="text-xs text-zinc-500">{t("filterKindsHint")}</p>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{org("team")}</legend>
        {teams.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("filterNoTeams")}</p>
        ) : (
          <div className="flex max-h-40 flex-col flex-wrap gap-2 overflow-auto sm:max-h-none sm:flex-row">
            {teams.map((team) => (
              <label key={team.id} className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  name="team"
                  value={team.id}
                  defaultChecked={query.teamIds.includes(team.id)}
                />
                {team.name}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-zinc-500">{t("filterTeamsHint")}</p>
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="includeDeleted" value="1" defaultChecked={query.includeDeleted} />
        {t("includeDeleted")}
      </label>
      <button type="submit" className={secondaryButtonClassName}>
        {t("applyFilters")}
      </button>
    </form>
  );
}
