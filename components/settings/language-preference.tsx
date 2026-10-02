"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { savePreferredLanguage } from "@/lib/settings/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { AppLocale } from "@/i18n/routing";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

const LANGUAGES: AppLocale[] = ["zh-Hant", "ja", "en"];

export function LanguagePreference({ current }: { current: AppLocale | null }) {
  const t = useTranslations("settings");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(savePreferredLanguage, INITIAL_ORG_ACTION_STATE);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold">{t("languageTitle")}</h2>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("languageLead")}</p>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("languageLabel")}
          <select
            name="preferred_language"
            defaultValue={current ?? "zh-Hant"}
            className={inputClassName}
          >
            {LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {t(`languages.${language}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={primaryButtonClassName}>
          {pending ? org("saving") : t("languageSave")}
        </button>
        {state.ok ? (
          <p role="status" className="w-full text-sm text-emerald-700 dark:text-emerald-300">
            {t("languageSaved")}
          </p>
        ) : null}
        {state.errorKey ? (
          <p role="alert" className="w-full text-sm text-red-700 dark:text-red-300">
            {org(`errors.${state.errorKey}`)}
          </p>
        ) : null}
      </form>
    </section>
  );
}
