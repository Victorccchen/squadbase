"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { exportAdminPhotoPack } from "@/lib/org/photo-pack-actions";
import type { OrgErrorKey } from "@/lib/org/errors";
import type { Team } from "@/lib/supabase/database.types";
import { primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";

const PHOTO_PACK_ERROR_KEYS = new Set<OrgErrorKey>([
  "forbidden",
  "notConfigured",
  "missingTeam",
  "invalidTeamKind",
  "photoPackTooMany",
  "generic",
]);

function downloadBase64(filename: string, mime: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type PhotoPackExportFormProps = {
  ageSquads?: Pick<Team, "id" | "name">[];
  competitionTeams?: Pick<Team, "id" | "name">[];
  teamId?: string;
  variant: "reports" | "team";
};

export function PhotoPackExportForm({
  ageSquads = [],
  competitionTeams = [],
  teamId,
  variant,
}: PhotoPackExportFormProps) {
  const t = useTranslations("reports");
  const org = useTranslations("org");
  const adminT = useTranslations("admin");
  const [errorKey, setErrorKey] = useState<OrgErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function errorText(key: OrgErrorKey) {
    return PHOTO_PACK_ERROR_KEYS.has(key) ? org(`errors.${key}`) : org("errors.generic");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setErrorKey(null);
    startTransition(async () => {
      const result = await exportAdminPhotoPack(formData);
      if (!result.ok || !result.filename || !result.mime || !result.base64) {
        setErrorKey(result.errorKey ?? "generic");
        return;
      }
      downloadBase64(result.filename, result.mime, result.base64);
    });
  }

  const label = variant === "team" ? t("photoPack.teamDownload") : t("photoPack.download");

  return (
    <section className="flex flex-col gap-4 rounded-xl border-2 border-zinc-800 bg-zinc-100 p-4 dark:border-zinc-200 dark:bg-zinc-950">
      {variant === "reports" ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            {t("photoPack.title")}
          </h2>
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">{t("photoPack.lead")}</p>
        </div>
      ) : null}
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <LocaleHiddenField />
        {teamId ? <input type="hidden" name="teamId" value={teamId} /> : null}
        {variant === "reports" ? (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{org("kindAgeSquad")}</legend>
              {ageSquads.length === 0 ? (
                <p className="text-sm text-zinc-500">{adminT("filterNoTeams")}</p>
              ) : (
                <div className="flex max-h-40 flex-col flex-wrap gap-2 overflow-auto sm:max-h-none sm:flex-row">
                  {ageSquads.map((team) => (
                    <label key={team.id} className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" name="ageSquad" value={team.id} />
                      {team.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{org("kindCompetitionTeam")}</legend>
              {competitionTeams.length === 0 ? (
                <p className="text-sm text-zinc-500">{adminT("filterNoTeams")}</p>
              ) : (
                <div className="flex max-h-40 flex-col flex-wrap gap-2 overflow-auto sm:max-h-none sm:flex-row">
                  {competitionTeams.map((team) => (
                    <label key={team.id} className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" name="competitionTeam" value={team.id} />
                      {team.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <p className="text-xs text-zinc-500">{t("photoPack.hint")}</p>
          </>
        ) : (
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">{t("photoPack.teamHint")}</p>
        )}
        {errorKey ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
            {errorText(errorKey)}
          </p>
        ) : null}
        <button
          type="submit"
          className={variant === "team" ? secondaryButtonClassName : primaryButtonClassName}
          disabled={pending}
        >
          {pending ? t("photoPack.downloading") : label}
        </button>
      </form>
    </section>
  );
}
