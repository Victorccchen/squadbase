"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ageBandFromBirthDate,
  formatIsoDate,
  seasonStartForBirthDate,
} from "@/lib/age-band";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { Player, Team, TeamMembership } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type PlayerFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  player?: Pick<Player, "name_zh" | "name_en" | "name_ja" | "birth_date" | "status">;
  membership?: Pick<TeamMembership, "team_id" | "jersey_number"> | null;
  teams: Pick<Team, "id" | "name" | "age_band" | "status">[];
  submitLabel: string;
};

export function PlayerForm({
  action,
  player,
  membership,
  teams,
  submitLabel,
}: PlayerFormProps) {
  const t = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  const [birthDate, setBirthDate] = useState(player?.birth_date ?? "");
  const [teamId, setTeamId] = useState(membership?.team_id ?? "");

  const suggestedBand = useMemo(
    () => (birthDate ? ageBandFromBirthDate(birthDate) : null),
    [birthDate],
  );
  const seasonStart = seasonStartForBirthDate();
  const selectedTeam = teams.find((team) => team.id === teamId);
  const mismatch =
    suggestedBand && selectedTeam && selectedTeam.age_band !== "reserve"
      ? suggestedBand !== selectedTeam.age_band
      : false;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("nameZh")}
        <input
          name="name_zh"
          required
          defaultValue={player?.name_zh ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("nameEn")}
        <input
          name="name_en"
          required
          defaultValue={player?.name_en ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("nameJa")}
        <input
          name="name_ja"
          required
          defaultValue={player?.name_ja ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("birthDate")}
        <input
          name="birth_date"
          type="date"
          required
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
          className={inputClassName}
        />
      </label>
      <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm leading-6 dark:bg-zinc-800">
        {t("suggestedAgeBand")}:{" "}
        <strong>{suggestedBand ? t(`ageBands.${suggestedBand}`) : t("ageBandUnknown")}</strong>
        {seasonStart ? (
          <>
            <br />
            {t("seasonStartLabel", { date: formatIsoDate(seasonStart) })}
          </>
        ) : null}
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("team")}
        <select
          name="team_id"
          required
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          className={inputClassName}
        >
          <option value="">{t("selectTeam")}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name} ({t(`ageBands.${team.age_band}`)})
              {team.status === "inactive" ? ` · ${t("statusInactive")}` : ""}
            </option>
          ))}
        </select>
      </label>
      {mismatch ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          {t("ageBandMismatch")}
        </p>
      ) : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("jerseyNumber")}
        <input
          name="jersey_number"
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          required
          defaultValue={membership?.jersey_number ?? ""}
          className={inputClassName}
        />
        <span className="font-normal text-zinc-500">{t("jerseyHint")}</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("status")}
        <select
          name="status"
          defaultValue={player?.status ?? "active"}
          className={inputClassName}
        >
          <option value="active">{t("statusActive")}</option>
          <option value="inactive">{t("statusInactive")}</option>
        </select>
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {t(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? t("saving") : submitLabel}
      </button>
    </form>
  );
}
