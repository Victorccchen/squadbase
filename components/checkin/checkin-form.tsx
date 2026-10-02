"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { parentCheckin } from "@/lib/checkin/actions";
import { INITIAL_CHECKIN_STATE } from "@/lib/checkin/state";
import { sessionsNeedingChoice, type CheckinPreview } from "@/lib/checkin/model";
import { localizedPlayerName } from "@/lib/org/display-name";
import { primaryButtonClassName } from "@/lib/ui";

type CheckinFormProps = {
  token: string;
  locale: string;
  preview: CheckinPreview;
  /** Children who can still check in (pre-selected). */
  selectablePlayerIds: string[];
};

function timeLabel(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** PR-07: big, phone-first check-in. Siblings can be checked in together. */
export function CheckinForm({ token, locale, preview, selectablePlayerIds }: CheckinFormProps) {
  const t = useTranslations("checkin");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(parentCheckin, INITIAL_CHECKIN_STATE);
  const [selected, setSelected] = useState<string[]>(selectablePlayerIds);
  const choices = sessionsNeedingChoice(preview, selected);
  const nameOf = (playerId: string) => {
    const child = preview.children.find((row) => row.playerId === playerId);
    return child ? localizedPlayerName(child.names, locale) : "";
  };
  const sessionTitle = (sessionId: string) =>
    preview.sessions.find((row) => row.id === sessionId)?.title ?? "";

  const done = state.results.filter((row) => row.result === "checked_in" || row.result === "already");
  if (done.length > 0 && state.results.every((row) => row.result !== "choose")) {
    return (
      <section role="status" className="flex flex-col gap-3 rounded-2xl bg-emerald-50 p-6 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50">
        <h2 className="text-xl font-semibold">{t("successTitle")}</h2>
        <ul className="flex flex-col gap-2 text-base">
          {state.results.map((row) => (
            <li key={row.playerId}>
              {row.result === "checked_in" || row.result === "already"
                ? t(row.result === "already" ? "resultAlready" : "resultCheckedIn", {
                    name: nameOf(row.playerId),
                    session: sessionTitle(row.sessionId),
                    credits: row.creditsAvailable,
                  })
                : t("resultNoSession", { name: nameOf(row.playerId) })}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-semibold">{t("whoTitle")}</legend>
        {selectablePlayerIds.map((playerId) => (
          <label
            key={playerId}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-zinc-300 bg-white px-4 text-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            <input
              type="checkbox"
              name="player_id"
              value={playerId}
              className="size-6"
              checked={selected.includes(playerId)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, playerId]
                    : current.filter((id) => id !== playerId),
                )
              }
            />
            {nameOf(playerId)}
          </label>
        ))}
      </fieldset>

      {choices.length > 1 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-base font-semibold">{t("chooseSession")}</legend>
          {choices.map((session, index) => (
            <label
              key={session.id}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-zinc-300 bg-white px-4 text-base dark:border-zinc-700 dark:bg-zinc-900"
            >
              <input type="radio" name="session_id" value={session.id} required defaultChecked={index === 0} className="size-5" />
              {session.title} · {session.teamName} · {timeLabel(session.startsAt, locale)}
            </label>
          ))}
        </fieldset>
      ) : null}

      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      {state.results.some((row) => row.result === "no_session") ? (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          {state.results
            .filter((row) => row.result === "no_session")
            .map((row) => t("resultNoSession", { name: nameOf(row.playerId) }))
            .join(" ")}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || selected.length === 0}
        className={`${primaryButtonClassName} min-h-14 text-lg`}
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
