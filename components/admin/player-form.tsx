"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import {
  ageBandFromBirthDate,
  birthAgeLabelFromBirthDate,
  formatIsoDate,
  seasonStartForBirthDate,
} from "@/lib/age-band";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import {
  competitionMembershipDecision,
  isAgeSquad,
  isCompetitionTeam,
} from "@/lib/org/squad-team";
import type { Player, Team, TeamMembership } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName, quietButtonClassName } from "@/lib/ui";

type PlayerFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  player?: Pick<
    Player,
    | "name_zh"
    | "name_en_given"
    | "name_en_family"
    | "name_ja"
    | "birth_date"
    | "status"
    | "continues_training"
  >;
  membership?: Pick<TeamMembership, "team_id" | "jersey_number" | "status"> | null;
  memberships?: (Pick<TeamMembership, "team_id" | "jersey_number" | "status"> & {
    team?: Pick<Team, "kind"> | null;
  })[];
  teams: Pick<Team, "id" | "name" | "age_band" | "status" | "kind" | "layer_key" | "eligible_birth_ages">[];
  submitLabel: string;
};

function initialSlots(
  memberships: PlayerFormProps["memberships"],
  teams: PlayerFormProps["teams"],
) {
  const active = (memberships ?? []).filter((row) => row.status === "active");
  const squad = active.find((row) => {
    const team = teams.find((unit) => unit.id === row.team_id);
    return team ? isAgeSquad(team) : row.team?.kind === "age_squad";
  });
  const competition = active
    .filter((row) => {
      const team = teams.find((unit) => unit.id === row.team_id);
      return team ? isCompetitionTeam(team) : row.team?.kind === "competition_team";
    })
    .slice()
    .sort((a, b) => {
      const nameA = teams.find((unit) => unit.id === a.team_id)?.name ?? "";
      const nameB = teams.find((unit) => unit.id === b.team_id)?.name ?? "";
      return nameA.localeCompare(nameB);
    });
  return {
    squadId: squad?.team_id ?? "",
    squadJersey: squad?.jersey_number != null ? String(squad.jersey_number) : "",
    teamId: competition[0]?.team_id ?? "",
    jersey: competition[0]?.jersey_number != null ? String(competition[0].jersey_number) : "",
    teamId2: competition[1]?.team_id ?? "",
    jersey2: competition[1]?.jersey_number != null ? String(competition[1].jersey_number) : "",
    showSecond: Boolean(competition[1]),
  };
}

export function PlayerForm({
  action,
  player,
  memberships,
  teams,
  submitLabel,
}: PlayerFormProps) {
  const t = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  const [birthDate, setBirthDate] = useState(player?.birth_date ?? "");
  const [continuesTraining, setContinuesTraining] = useState(player?.continues_training ?? true);
  const initial = initialSlots(memberships, teams);
  const [squadId, setSquadId] = useState(initial.squadId);
  const [teamId, setTeamId] = useState(initial.teamId);
  const [teamId2, setTeamId2] = useState(initial.teamId2);
  const [showSecond, setShowSecond] = useState(initial.showSecond);

  const ageSquads = teams.filter((team) => isAgeSquad(team));
  const competitionTeams = teams.filter((team) => isCompetitionTeam(team));
  const suggestedSquad = useMemo(
    () => (birthDate ? ageBandFromBirthDate(birthDate) : null),
    [birthDate],
  );
  const birthAge = useMemo(
    () => (birthDate ? birthAgeLabelFromBirthDate(birthDate) : null),
    [birthDate],
  );
  const seasonStart = seasonStartForBirthDate();

  function competitionDisabled(
    team: (typeof competitionTeams)[number],
    otherTeamId: string,
  ): boolean {
    if (team.id === otherTeamId) {
      return true;
    }
    const others = [teamId, teamId2]
      .filter((id) => id && id !== team.id)
      .map((id) => competitionTeams.find((row) => row.id === id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const decision = competitionMembershipDecision({
      birthAge,
      continuesTraining,
      team,
      otherActiveTeams: others,
    });
    return !decision.ok;
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
        <input name="name_zh" defaultValue={player?.name_zh ?? ""} className={inputClassName} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("nameJa")}
        <input name="name_ja" defaultValue={player?.name_ja ?? ""} className={inputClassName} />
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
        {t("suggestedAgeSquad")}:{" "}
        <strong>{suggestedSquad ? t(`ageBands.${suggestedSquad}`) : t("ageBandUnknown")}</strong>
        {birthAge ? (
          <>
            <br />
            {t("birthAgeLabel")}: <strong>{birthAge}</strong>
          </>
        ) : null}
        {seasonStart ? (
          <>
            <br />
            {t("seasonStartLabel", { date: formatIsoDate(seasonStart) })}
          </>
        ) : null}
        <br />
        {t("membershipRuleHint")}
      </p>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="continues_training"
          value="true"
          checked={continuesTraining}
          onChange={(event) => setContinuesTraining(event.target.checked)}
        />
        {t("continuesTraining")}
      </label>
      <p className="text-xs font-normal text-zinc-500">{t("continuesTrainingHint")}</p>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t("ageSquad")}</legend>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("ageSquad")}
          <select
            name="age_squad_id"
            required
            value={squadId}
            onChange={(event) => setSquadId(event.target.value)}
            className={inputClassName}
          >
            <option value="">{t("selectAgeSquad")}</option>
            {ageSquads.map((team) => (
              <option
                key={team.id}
                value={team.id}
                disabled={Boolean(suggestedSquad) && team.age_band !== suggestedSquad && team.id !== squadId}
              >
                {team.name} ({t(`ageBands.${team.age_band}`)})
                {team.status === "inactive" ? ` · ${t("statusInactive")}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("jerseyNumber")}
          <input
            name="age_squad_jersey"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            required
            key={`age-squad-jersey-${initial.squadId}`}
            defaultValue={initial.squadJersey}
            className={inputClassName}
          />
          <span className="font-normal text-zinc-500">{t("jerseyHintSquad")}</span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t("firstCompetitionTeam")}</legend>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("competitionTeam")}
          <select
            name="team_id"
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            className={inputClassName}
          >
            <option value="">{t("selectCompetitionTeamOptional")}</option>
            {competitionTeams.map((team) => (
              <option
                key={team.id}
                value={team.id}
                disabled={competitionDisabled(team, teamId2) && team.id !== teamId}
              >
                {team.name}
                {team.status === "inactive" ? ` · ${t("statusInactive")}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("jerseyNumber")}
          <input
            name="jersey_number"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            key={`comp-jersey-${initial.teamId}`}
            defaultValue={initial.jersey}
            className={inputClassName}
          />
          <span className="font-normal text-zinc-500">{t("jerseyHint")}</span>
        </label>
      </fieldset>

      {showSecond ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">{t("secondCompetitionTeam")}</legend>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("competitionTeam")}
            <select
              name="team_id_2"
              value={teamId2}
              onChange={(event) => setTeamId2(event.target.value)}
              className={inputClassName}
            >
              <option value="">{t("selectCompetitionTeamOptional")}</option>
              {competitionTeams.map((team) => (
                <option
                  key={team.id}
                  value={team.id}
                  disabled={competitionDisabled(team, teamId) && team.id !== teamId2}
                >
                  {team.name}
                  {team.status === "inactive" ? ` · ${t("statusInactive")}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("jerseyNumber")}
            <input
              name="jersey_number_2"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              key={`comp-jersey-2-${initial.teamId2}`}
              defaultValue={initial.jersey2}
              className={inputClassName}
            />
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
          disabled={!continuesTraining}
          onClick={() => setShowSecond(true)}
        >
          {t("addSecondTeam")}
        </button>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("status")}
        <select name="status" defaultValue={player?.status ?? "active"} className={inputClassName}>
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
