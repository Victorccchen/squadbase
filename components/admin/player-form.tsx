"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import {
  ageBandFromBirthDate,
  allowedTeamAgeBands,
  formatIsoDate,
  isTeamAgeBandAllowedForPlayer,
  nextHigherComputedAgeBand,
  seasonStartForBirthDate,
} from "@/lib/age-band";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { AgeBand, Player, Team, TeamMembership } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName, quietButtonClassName } from "@/lib/ui";

type PlayerFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  player?: Pick<
    Player,
    "name_zh" | "name_en_given" | "name_en_family" | "name_ja" | "birth_date" | "status"
  >;
  membership?: Pick<TeamMembership, "team_id" | "jersey_number" | "status"> | null;
  memberships?: Pick<TeamMembership, "team_id" | "jersey_number" | "status">[];
  teams: Pick<Team, "id" | "name" | "age_band" | "status">[];
  submitLabel: string;
};

function initialActiveSlots(
  memberships: Pick<TeamMembership, "team_id" | "jersey_number" | "status">[] | undefined,
  membership: Pick<TeamMembership, "team_id" | "jersey_number" | "status"> | null | undefined,
) {
  const active = (memberships ?? []).filter((row) => row.status === "active");
  const first = active[0] ?? membership ?? null;
  const second = active[1] ?? null;
  return {
    teamId: first?.team_id ?? "",
    jersey: first?.jersey_number != null ? String(first.jersey_number) : "",
    teamId2: second?.team_id ?? "",
    jersey2: second?.jersey_number != null ? String(second.jersey_number) : "",
    showSecond: Boolean(second),
  };
}

function slotState(
  suggestedBand: ReturnType<typeof ageBandFromBirthDate>,
  teamBand: AgeBand | undefined,
): "ok" | "playUp" | "notAllowed" {
  if (!suggestedBand || !teamBand) {
    return "ok";
  }
  if (teamBand === suggestedBand) {
    return "ok";
  }
  if (nextHigherComputedAgeBand(suggestedBand) === teamBand) {
    return "playUp";
  }
  return "notAllowed";
}

export function PlayerForm({
  action,
  player,
  membership,
  memberships,
  teams,
  submitLabel,
}: PlayerFormProps) {
  const t = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  const [birthDate, setBirthDate] = useState(player?.birth_date ?? "");
  const initial = initialActiveSlots(memberships, membership);
  const [teamId, setTeamId] = useState(initial.teamId);
  const [teamId2, setTeamId2] = useState(initial.teamId2);
  const [showSecond, setShowSecond] = useState(initial.showSecond);

  const suggestedBand = useMemo(
    () => (birthDate ? ageBandFromBirthDate(birthDate) : null),
    [birthDate],
  );
  const seasonStart = seasonStartForBirthDate();
  const allowedBands = suggestedBand ? allowedTeamAgeBands(suggestedBand) : [];
  const selectedTeam = teams.find((team) => team.id === teamId);
  const selectedTeam2 = teams.find((team) => team.id === teamId2);
  const firstState = slotState(suggestedBand, selectedTeam?.age_band);
  const secondState = slotState(suggestedBand, selectedTeam2?.age_band);

  function teamOptionDisabled(team: (typeof teams)[number], otherTeamId: string) {
    if (team.id === otherTeamId) {
      return true;
    }
    if (!suggestedBand) {
      return false;
    }
    return !isTeamAgeBandAllowedForPlayer(suggestedBand, team.age_band);
  }

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("nameEnGiven")}
        <input
          name="name_en_given"
          required
          autoComplete="given-name"
          defaultValue={player?.name_en_given ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("nameEnFamily")}
        <input
          name="name_en_family"
          required
          autoComplete="family-name"
          defaultValue={player?.name_en_family ?? ""}
          className={inputClassName}
        />
      </label>
      <p className="text-sm font-normal text-zinc-500">{t("nameCjkHint")}</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("nameZh")}
        <input
          name="name_zh"
          defaultValue={player?.name_zh ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("nameJa")}
        <input
          name="name_ja"
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
        {allowedBands.length > 0 ? (
          <>
            <br />
            {t("membershipRuleHint", {
              bands: allowedBands.map((band) => t(`ageBands.${band}`)).join(" / "),
            })}
          </>
        ) : null}
      </p>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t("firstTeam")}</legend>
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
              <option
                key={team.id}
                value={team.id}
                disabled={teamOptionDisabled(team, teamId2) && team.id !== teamId}
              >
                {team.name} ({t(`ageBands.${team.age_band}`)})
                {team.status === "inactive" ? ` · ${t("statusInactive")}` : ""}
              </option>
            ))}
          </select>
        </label>
        {firstState === "notAllowed" ? (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100"
          >
            {t("ageBandNotAllowed")}
          </p>
        ) : null}
        {firstState === "playUp" ? (
          <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-800">
            {t("playingUpNote")}
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
            defaultValue={initial.jersey}
            className={inputClassName}
          />
          <span className="font-normal text-zinc-500">{t("jerseyHint")}</span>
        </label>
      </fieldset>
      {showSecond ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">{t("secondTeam")}</legend>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("team")}
            <select
              name="team_id_2"
              required
              value={teamId2}
              onChange={(event) => setTeamId2(event.target.value)}
              className={inputClassName}
            >
              <option value="">{t("selectTeam")}</option>
              {teams.map((team) => (
                <option
                  key={team.id}
                  value={team.id}
                  disabled={teamOptionDisabled(team, teamId) && team.id !== teamId2}
                >
                  {team.name} ({t(`ageBands.${team.age_band}`)})
                  {team.status === "inactive" ? ` · ${t("statusInactive")}` : ""}
                </option>
              ))}
            </select>
          </label>
          {secondState === "notAllowed" ? (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100"
            >
              {t("ageBandNotAllowed")}
            </p>
          ) : null}
          {secondState === "playUp" ? (
            <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-800">
              {t("playingUpNote")}
            </p>
          ) : null}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("jerseyNumber")}
            <input
              name="jersey_number_2"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              required
              defaultValue={initial.jersey2}
              className={inputClassName}
            />
            <span className="font-normal text-zinc-500">{t("jerseyHint")}</span>
          </label>
          <button
            type="button"
            className={quietButtonClassName}
            onClick={() => {
              setShowSecond(false);
              setTeamId2("");
            }}
          >
            {t("removeSecondTeam")}
          </button>
        </fieldset>
      ) : (
        <button
          type="button"
          className={quietButtonClassName}
          onClick={() => setShowSecond(true)}
        >
          {t("addSecondTeam")}
        </button>
      )}
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
