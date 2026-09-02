"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { requestGuardianLink, searchPlayerForLink } from "@/lib/org/binding-actions";
import {
  INITIAL_ORG_ACTION_STATE,
  INITIAL_SEARCH_PLAYERS_STATE,
} from "@/lib/org/errors";
import type { AgeBand, LinkableTeam } from "@/lib/supabase/database.types";
import { englishPlayerName, localizedPlayerName } from "@/lib/org/display-name";
import { inputClassName, primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";

type RequestLinkFormProps = {
  teams: LinkableTeam[];
};

export function RequestLinkForm({ teams }: RequestLinkFormProps) {
  const t = useTranslations("children");
  const org = useTranslations("org");
  const locale = useLocale();
  const [searchState, searchAction, searchPending] = useActionState(
    searchPlayerForLink,
    INITIAL_SEARCH_PLAYERS_STATE,
  );
  const [requestState, requestAction, requestPending] = useActionState(
    requestGuardianLink,
    INITIAL_ORG_ACTION_STATE,
  );

  return (
    <div className="flex flex-col gap-8">
      <form action={searchAction} className="flex max-w-xl flex-col gap-4">
        <LocaleHiddenField />
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("searchHint")}</p>

        <fieldset className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <legend className="px-1 text-sm font-semibold">{t("searchJerseyTitle")}</legend>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {org("team")}
            <select
              name="team_id"
              defaultValue=""
              disabled={teams.length === 0}
              className={inputClassName}
            >
              <option value="">{org("selectTeam")}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({org(`ageBands.${team.age_band}` as `ageBands.${AgeBand}`)})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {org("jerseyNumber")}
            <input
              name="jersey_number"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              className={inputClassName}
            />
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <legend className="px-1 text-sm font-semibold">{t("searchIdentityTitle")}</legend>
          <p className="text-sm font-normal text-zinc-500">{t("searchIdentityHint")}</p>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {org("birthDate")}
            <input name="birth_date" type="date" className={inputClassName} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("nameFragment")}
            <input
              name="name_fragment"
              autoComplete="off"
              className={inputClassName}
            />
          </label>
        </fieldset>

        {searchState.errorKey ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
            {org(`errors.${searchState.errorKey}`)}
          </p>
        ) : null}

        <button type="submit" disabled={searchPending} className={secondaryButtonClassName}>
          {searchPending ? t("searching") : t("search")}
        </button>
      </form>

      {searchState.matches.length > 0 ? (
        <form action={requestAction} className="flex max-w-xl flex-col gap-4">
          <LocaleHiddenField />
          <h3 className="text-base font-semibold">{t("matchesTitle")}</h3>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("confirmHint")}</p>
          <ul className="flex flex-col gap-2">
            {searchState.matches.map((match, index) => (
              <li key={match.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <input
                    type="radio"
                    name="player_id"
                    value={match.id}
                    required
                    defaultChecked={index === 0}
                    className="mt-1"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="font-medium">
                      {localizedPlayerName(match, locale)}
                    </span>
                    <span className="text-sm text-zinc-500">
                      {englishPlayerName(match)}
                      {match.team_name
                        ? ` · ${match.team_name} · #${match.jersey_number}`
                        : ""}
                      {` · ${match.birth_date}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("relation")}
            <select name="relation" defaultValue="parent" className={inputClassName}>
              <option value="parent">{t("relations.parent")}</option>
              <option value="guardian">{t("relations.guardian")}</option>
              <option value="other">{t("relations.other")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("parentNote")}
            <textarea
              name="parent_note"
              rows={3}
              maxLength={1000}
              className={inputClassName}
            />
            <span className="font-normal text-zinc-500">{t("parentNoteHint")}</span>
          </label>
          {requestState.errorKey ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
              {org(`errors.${requestState.errorKey}`)}
            </p>
          ) : null}
          <button type="submit" disabled={requestPending} className={primaryButtonClassName}>
            {requestPending ? org("saving") : t("submitRequest")}
          </button>
        </form>
      ) : null}
    </div>
  );
}
