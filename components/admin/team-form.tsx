"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { AGE_BANDS, BIRTH_AGE_LABELS } from "@/lib/age-band";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import { LAYER_KEYS, defaultEligibleBirthAges, type LayerKey } from "@/lib/org/squad-team";
import type { AgeBand, Team } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type TeamFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  team?: Pick<Team, "name" | "age_band" | "status" | "kind" | "layer_key" | "eligible_birth_ages">;
  defaultKind?: "age_squad" | "competition_team";
  submitLabel: string;
};

export function TeamForm({ action, team, defaultKind = "age_squad", submitLabel }: TeamFormProps) {
  const t = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  const lockedKind = Boolean(team);
  const [kind, setKind] = useState<"age_squad" | "competition_team">(
    team?.kind ?? defaultKind,
  );
  const [layerKey, setLayerKey] = useState<LayerKey>(
    (team?.layer_key as LayerKey | null) ?? "u8",
  );
  const [eligible, setEligible] = useState<string[]>(
    team?.eligible_birth_ages ?? defaultEligibleBirthAges(layerKey),
  );

  function onLayerChange(next: LayerKey) {
    setLayerKey(next);
    setEligible(defaultEligibleBirthAges(next));
  }

  function toggleEligible(label: string) {
    setEligible((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  }

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <input type="hidden" name="kind" value={kind} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("teamKind")}
        <select
          value={kind}
          disabled={lockedKind}
          onChange={(event) =>
            setKind(event.target.value === "competition_team" ? "competition_team" : "age_squad")
          }
          className={inputClassName}
        >
          <option value="age_squad">{t("kindAgeSquad")}</option>
          <option value="competition_team">{t("kindCompetitionTeam")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("teamName")}
        <input name="name" required defaultValue={team?.name ?? ""} className={inputClassName} />
      </label>
      {kind === "age_squad" ? (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("ageBand")}
          <select
            name="age_band"
            required
            defaultValue={team?.age_band ?? "U8"}
            className={inputClassName}
          >
            {AGE_BANDS.map((band) => (
              <option key={band} value={band}>
                {t(`ageBands.${band}` as `ageBands.${AgeBand}`)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("layerKey")}
            <select
              name="layer_key"
              required
              value={layerKey}
              onChange={(event) => onLayerChange(event.target.value as LayerKey)}
              className={inputClassName}
            >
              {LAYER_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t("eligibleBirthAges")}</legend>
            <div className="flex flex-wrap gap-2">
              {BIRTH_AGE_LABELS.map((label) => (
                <label key={label} className="flex items-center gap-1.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="eligible_birth_ages"
                    value={label}
                    checked={eligible.includes(label)}
                    onChange={() => toggleEligible(label)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("status")}
        <select name="status" defaultValue={team?.status ?? "active"} className={inputClassName}>
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
