"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { INITIAL_ORG_ACTION_STATE, type OrgActionState } from "@/lib/org/errors";
import { MAX_ROUND_LABEL, MAX_ROUND_NO } from "@/lib/org/match-listing";
import type { MatchListingOptions } from "@/lib/org/match-queries";
import type { MatchPublication } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type MatchListingFormProps = {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  options: MatchListingOptions;
  publication: Pick<
    MatchPublication,
    | "opponent_club_id"
    | "public_venue_id"
    | "season_id"
    | "competition_id"
    | "round_no"
    | "round_label"
  >;
};

export function MatchListingForm({ action, options, publication }: MatchListingFormProps) {
  const t = useTranslations("matchListing");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  const opponents = options.clubs.filter(
    (club) => !club.is_self || club.id === publication.opponent_club_id,
  );

  return (
    <form action={formAction} className="grid max-w-xl gap-4 sm:grid-cols-2">
      <LocaleHiddenField />
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300 sm:col-span-2">
        {t("hint")}
      </p>
      {options.clubs.length === 0 || options.venues.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100 sm:col-span-2">
          {t("emptyRefs")}
        </p>
      ) : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
        {t("opponentClub")}
        <select
          name="opponent_club_id"
          defaultValue={publication.opponent_club_id ?? ""}
          className={inputClassName}
        >
          <option value="">{t("none")}</option>
          {opponents.map((club) => (
            <option key={club.id} value={club.id}>
              {club.name_zh}
              {club.short_zh && club.short_zh !== club.name_zh ? `（${club.short_zh}）` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
        {t("publicVenue")}
        <select
          name="public_venue_id"
          defaultValue={publication.public_venue_id ?? ""}
          className={inputClassName}
        >
          <option value="">{t("none")}</option>
          {options.venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name_zh}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("season")}
        <select
          name="season_id"
          defaultValue={publication.season_id ?? ""}
          className={inputClassName}
        >
          <option value="">{t("none")}</option>
          {options.seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.is_current ? t("currentSeason", { label: season.label }) : season.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("competition")}
        <select
          name="competition_id"
          defaultValue={publication.competition_id ?? ""}
          className={inputClassName}
        >
          <option value="">{t("none")}</option>
          {options.competitions.map((competition) => (
            <option key={competition.id} value={competition.id}>
              {competition.short ? `${competition.short} · ${competition.name_zh}` : competition.name_zh}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("roundNo")}
        <input
          name="round_no"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_ROUND_NO}
          step={1}
          defaultValue={publication.round_no ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("roundLabel")}
        <input
          name="round_label"
          maxLength={MAX_ROUND_LABEL}
          defaultValue={publication.round_label ?? ""}
          placeholder={t("roundLabelPlaceholder")}
          className={inputClassName}
        />
      </label>
      {state.errorKey ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100 sm:col-span-2"
        >
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={`${primaryButtonClassName} sm:col-span-2`}
      >
        {pending ? org("saving") : t("save")}
      </button>
    </form>
  );
}
