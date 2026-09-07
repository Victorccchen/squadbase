"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import { localizedPlayerName } from "@/lib/org/display-name";
import type { Player } from "@/lib/supabase/database.types";
import { primaryButtonClassName } from "@/lib/ui";

type RosterOption = {
  player: Player;
  jerseyNumber: number;
};

type MatchRosterFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  options: RosterOption[];
  selectedIds: string[];
  locale: string;
};

export function MatchRosterForm({
  action,
  options,
  selectedIds,
  locale,
}: MatchRosterFormProps) {
  const t = useTranslations("matches");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  const selected = new Set(selectedIds);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <LocaleHiddenField />
      {options.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("rosterEmptyBody")}</p>
      ) : (
        <ul className="grid gap-2">
          {options.map((row) => (
            <li key={row.player.id}>
              <label className="flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm dark:border-zinc-700">
                <input
                  type="checkbox"
                  name="player_ids"
                  value={row.player.id}
                  defaultChecked={selected.has(row.player.id)}
                />
                <span className="font-medium tabular-nums">#{row.jerseyNumber}</span>
                <span>{localizedPlayerName(row.player, locale)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : t("saveRoster")}
      </button>
    </form>
  );
}
