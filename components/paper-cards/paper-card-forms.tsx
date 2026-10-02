"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { HeadshotResizeEnhancer } from "@/components/players/headshot-resize-enhancer";
import {
  confirmPaperCard,
  discardPaperCard,
  recordPaperCardCheck,
  rerunPaperCardExtraction,
  retryPaperCardPhotoPurge,
  startPaperCard,
} from "@/lib/credits/paper-card-actions";
import { INITIAL_PAPER_CHECK_STATE } from "@/lib/credits/paper-card-state";
import {
  PAPER_CARD_PACKAGES,
  PAPER_CARD_UNIT_COST_TWD,
  confirmProblem,
  parseUsedDates,
  suggestedRemaining,
  type ReviewedCell,
} from "@/lib/credits/paper-card";
import { filterCashPlayers } from "@/lib/cash/model";
import type { CashPlayer } from "@/lib/cash/queries";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import {
  dangerButtonClassName,
  inputClassName,
  primaryButtonClassName,
  quietButtonClassName,
  secondaryButtonClassName,
} from "@/lib/ui";

function ErrorLine({ errorKey }: { errorKey: string | null }) {
  const org = useTranslations("org");
  return errorKey ? (
    <p role="alert" className="text-sm text-red-800 dark:text-red-200">
      {org(`errors.${errorKey}`)}
    </p>
  ) : null;
}

function PlayerPicker({
  players,
  playerId,
  onChange,
}: {
  players: CashPlayer[];
  playerId: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("cash");
  const [query, setQuery] = useState("");
  const player = players.find((row) => row.id === playerId) ?? null;
  const matches = filterCashPlayers(players, query);
  if (player) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900">
        <span className="font-medium">{player.label}</span>
        <button type="button" className={secondaryButtonClassName} onClick={() => onChange("")}>
          {t("change")}
        </button>
      </div>
    );
  }
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {t("searchChild")}
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("searchPlaceholder")}
        className={`${inputClassName} min-h-12 text-base`}
        autoComplete="off"
      />
      <ul className="flex flex-col gap-2">
        {matches.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onChange(row.id)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-base dark:border-zinc-800 dark:bg-zinc-900"
            >
              {row.label}
            </button>
          </li>
        ))}
      </ul>
    </label>
  );
}

/** Step 1: choose the child, photograph the card (front and back). */
export function StartPaperCardForm({ players, aiConfigured }: { players: CashPlayer[]; aiConfigured: boolean }) {
  const t = useTranslations("paperCards");
  const [state, formAction, pending] = useActionState(startPaperCard, INITIAL_ORG_ACTION_STATE);
  const [playerId, setPlayerId] = useState("");
  const [manual, setManual] = useState(!aiConfigured);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <LocaleHiddenField />
      <input type="hidden" name="player_id" value={playerId} />
      <input type="hidden" name="manual" value={manual ? "true" : "false"} />
      <PlayerPicker players={players} playerId={playerId} onChange={setPlayerId} />
      {(["front", "back"] as const).map((side) => (
        <label key={side} className="flex flex-col gap-1.5 text-sm font-medium">
          {t(side === "front" ? "photoFront" : "photoBack")}
          <input
            id={`paper-card-${side}`}
            type="file"
            name={side}
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="text-base"
          />
          <HeadshotResizeEnhancer inputId={`paper-card-${side}`} />
        </label>
      ))}
      <p className="text-sm text-zinc-500">{aiConfigured ? t("aiHint") : t("aiNotConfigured")}</p>
      {aiConfigured ? (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5" checked={manual} onChange={(event) => setManual(event.target.checked)} />
          {t("noPhotoManual")}
        </label>
      ) : null}
      <p className="text-sm text-zinc-500">{t("photoPrivacy")}</p>
      <button type="submit" disabled={pending || !playerId} className={`${primaryButtonClassName} min-h-12`}>
        {pending ? t("reading") : t("start")}
      </button>
      {pending ? <p className="text-sm text-zinc-500">{t("readingHint")}</p> : null}
      <ErrorLine errorKey={state.errorKey} />
    </form>
  );
}

/** Step 2: staff check every cell (low ones are yellow) and confirm. */
export function ReviewPaperCardForm({
  cardId,
  cells,
  cardNo,
  packageCredits,
  today,
  systemBalance,
}: {
  cardId: string;
  cells: ReviewedCell[];
  cardNo: string;
  packageCredits: number | null;
  today: string;
  systemBalance: number;
}) {
  const t = useTranslations("paperCards");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(confirmPaperCard, INITIAL_ORG_ACTION_STATE);
  const [dates, setDates] = useState<string[]>(cells.map((cell) => cell.date ?? ""));
  const [pkg, setPkg] = useState<string>(packageCredits ? String(packageCredits) : "");
  const used = parseUsedDates(dates);
  const suggestion = suggestedRemaining(pkg ? Number(pkg) : null, used.length);
  const [remaining, setRemaining] = useState<string>("");
  const remainingValue = remaining === "" ? suggestion : Number(remaining);
  const problem = confirmProblem({
    packageCredits: pkg ? Number(pkg) : null,
    remaining: remainingValue,
    usedDates: used,
    today,
  });
  const lowCount = cells.filter((cell, i) => cell.flag && dates[i] === (cell.date ?? "")).length;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        if (!window.confirm(t("confirmPrompt", { remaining: remainingValue ?? 0, used: used.length }))) {
          event.preventDefault();
        }
      }}
    >
      <LocaleHiddenField />
      <input type="hidden" name="card_id" value={cardId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("cardNo")}
          <input name="card_no" defaultValue={cardNo} maxLength={40} className={`${inputClassName} min-h-12 text-base`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("package")}
          <select
            name="package_credits"
            required
            value={pkg}
            onChange={(event) => setPkg(event.target.value)}
            className={`${inputClassName} min-h-12 text-base`}
          >
            <option value="">{t("selectPackage")}</option>
            {PAPER_CARD_PACKAGES.map((n) => (
              <option key={n} value={n}>
                {t("packageOption", { count: n, price: n * PAPER_CARD_UNIT_COST_TWD })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("cellsLegend")}</legend>
        {lowCount > 0 ? <p className="text-sm text-amber-800 dark:text-amber-200">{t("lowCount", { count: lowCount })}</p> : null}
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cells.map((cell, i) => {
            const flagged = Boolean(cell.flag) && dates[i] === (cell.date ?? "");
            return (
              <li
                key={cell.index}
                className={`flex flex-col gap-1 rounded-xl border p-2 text-sm ${
                  flagged
                    ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <span className="flex items-center justify-between gap-2 text-zinc-500">
                  <span>#{cell.index}</span>
                  {cell.text ? <span>{t("asWritten", { text: cell.text })}</span> : null}
                </span>
                <input
                  type="date"
                  name="used_date"
                  max={today}
                  value={dates[i]}
                  onChange={(event) =>
                    setDates((current) => current.map((value, j) => (j === i ? event.target.value : value)))
                  }
                  className={`${inputClassName} min-h-11 text-base`}
                />
                {flagged && cell.flag ? (
                  <span className="text-amber-800 dark:text-amber-200">{t(`flags.${cell.flag}`)}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </fieldset>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("remaining")}
        <input
          name="remaining"
          inputMode="numeric"
          pattern="[0-9]*"
          value={remaining === "" ? (suggestion ?? "") : remaining}
          onChange={(event) => setRemaining(event.target.value.replace(/\D/g, ""))}
          className={`${inputClassName} min-h-12 w-32 text-base`}
        />
        <span className="font-normal text-zinc-500">
          {t("remainingHint", { used: used.length, suggestion: suggestion ?? "-" })}
        </span>
      </label>

      <p className="rounded-2xl bg-zinc-50 p-4 text-sm leading-6 dark:bg-zinc-900">
        {t("confirmEffect", {
          remaining: remainingValue ?? 0,
          amount: (remainingValue ?? 0) * PAPER_CARD_UNIT_COST_TWD,
          balance: systemBalance,
        })}
      </p>

      {problem ? <p className="text-sm text-amber-800 dark:text-amber-200">{t(`problems.${problem}`)}</p> : null}
      <button type="submit" disabled={pending || Boolean(problem)} className={`${primaryButtonClassName} min-h-12`}>
        {pending ? org("saving") : t("confirm")}
      </button>
      <ErrorLine errorKey={state.errorKey} />
    </form>
  );
}

function CardButtonForm({
  action,
  cardId,
  label,
  className,
  confirmMessage,
}: {
  action: typeof rerunPaperCardExtraction;
  cardId: string;
  label: string;
  className: string;
  confirmMessage?: string;
}) {
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION_STATE);
  return (
    <form
      action={formAction}
      className="flex flex-col items-start gap-2"
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <LocaleHiddenField />
      <input type="hidden" name="card_id" value={cardId} />
      <button type="submit" disabled={pending} className={className}>
        {pending ? org("saving") : label}
      </button>
      <ErrorLine errorKey={state.errorKey} />
    </form>
  );
}

export function RerunExtractionForm({ cardId }: { cardId: string }) {
  const t = useTranslations("paperCards");
  return <CardButtonForm action={rerunPaperCardExtraction} cardId={cardId} label={t("rerun")} className={secondaryButtonClassName} />;
}

export function DiscardPaperCardForm({ cardId }: { cardId: string }) {
  const t = useTranslations("paperCards");
  return (
    <CardButtonForm
      action={discardPaperCard}
      cardId={cardId}
      label={t("discard")}
      className={dangerButtonClassName}
      confirmMessage={t("discardConfirm")}
    />
  );
}

export function RetryPhotoPurgeForm({ cardId }: { cardId: string }) {
  const t = useTranslations("paperCards");
  return <CardButtonForm action={retryPaperCardPhotoPurge} cardId={cardId} label={t("retryPurge")} className={quietButtonClassName} />;
}

/** Weekly parallel check: count what is left on the card, compare with the system. */
export function PaperCheckForm({ players }: { players: CashPlayer[] }) {
  const t = useTranslations("paperCards");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(recordPaperCardCheck, INITIAL_PAPER_CHECK_STATE);
  const [playerId, setPlayerId] = useState("");
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <LocaleHiddenField />
      <input type="hidden" name="player_id" value={playerId} />
      <PlayerPicker players={players} playerId={playerId} onChange={setPlayerId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("cardRemaining")}
        <input
          name="card_remaining"
          inputMode="numeric"
          pattern="[0-9]*"
          required
          className={`${inputClassName} min-h-12 w-32 text-base`}
        />
        <span className="font-normal text-zinc-500">{t("cardRemainingHint")}</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("note")}
        <input name="note" maxLength={300} className={`${inputClassName} min-h-12 text-base`} />
      </label>
      <button type="submit" disabled={pending || !playerId} className={`${primaryButtonClassName} min-h-12`}>
        {pending ? org("saving") : t("recordCheck")}
      </button>
      <ErrorLine errorKey={state.errorKey} />
      {state.matches !== null ? (
        <p
          role="status"
          className={`rounded-2xl p-4 text-base ${
            state.matches
              ? "bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50"
              : "bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-50"
          }`}
        >
          {state.matches
            ? t("checkMatches", { count: state.cardRemaining ?? 0 })
            : t("checkMismatch", { card: state.cardRemaining ?? 0, system: state.systemRemaining ?? 0 })}
        </p>
      ) : null}
    </form>
  );
}
