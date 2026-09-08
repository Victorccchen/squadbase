import type { Team } from "@/lib/supabase/database.types";

type TeamCheckboxListProps = {
  teams: Pick<Team, "id" | "name">[];
  name?: string;
  legend: string;
  hint: string;
  emptyLabel: string;
};

/** Checkbox list matching the admin matches/sessions kind+team filter UI. */
export function TeamCheckboxList({
  teams,
  name = "team_id",
  legend,
  hint,
  emptyLabel,
}: TeamCheckboxListProps) {
  return (
    <fieldset className="flex flex-col gap-2" aria-required="true">
      <legend className="text-sm font-medium">{legend}</legend>
      {teams.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <div className="flex max-h-40 flex-col flex-wrap gap-2 overflow-auto sm:max-h-none sm:flex-row">
          {teams.map((team) => (
            <label key={team.id} className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name={name} value={team.id} />
              {team.name}
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-zinc-500">{hint}</p>
    </fieldset>
  );
}
