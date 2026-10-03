"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import type { MatchBroadcastState } from "@/lib/org/match-actions";
import {
  MAX_LIVE_WINDOW_BEFORE_MIN,
  youTubeThumbnailUrl,
  youTubeWatchUrl,
  type BroadcastField,
  type MatchBroadcastCheck,
} from "@/lib/org/youtube";
import type { MatchEmbedCheckStatus, MatchPublication } from "@/lib/supabase/database.types";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type MatchBroadcastFormProps = {
  action: (prev: MatchBroadcastState, formData: FormData) => Promise<MatchBroadcastState>;
  publication: Pick<
    MatchPublication,
    | "live_stream_url"
    | "live_video_id"
    | "replay_url"
    | "replay_video_id"
    | "highlights_url"
    | "highlights_video_id"
    | "embed_enabled"
    | "embed_check_status"
    | "video_title"
    | "live_window_before_min"
  >;
  checkedAtLabel: string | null;
};

const INITIAL_STATE: MatchBroadcastState = { ok: false, errorKey: null };

const STATUS_CLASS: Record<MatchEmbedCheckStatus, string> = {
  ok: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  blocked: "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  not_found: "bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
  unknown: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
};

function StatusBadge({ status, label }: { status: MatchEmbedCheckStatus; label: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {label}
    </span>
  );
}

export function MatchBroadcastForm({ action, publication, checkedAtLabel }: MatchBroadcastFormProps) {
  const t = useTranslations("matchBroadcast");
  const org = useTranslations("org");
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  const stored: { field: BroadcastField; videoId: string | null }[] = [
    { field: "live", videoId: publication.live_video_id },
    { field: "replay", videoId: publication.replay_video_id },
    { field: "highlights", videoId: publication.highlights_video_id },
  ];
  const storedVideos = stored.filter(
    (row): row is { field: BroadcastField; videoId: string } => Boolean(row.videoId),
  );
  const checks: MatchBroadcastCheck[] | null = state.ok && state.checks ? state.checks : null;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("hint")}</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("liveUrl")}
        <input
          name="live_stream_url"
          inputMode="url"
          maxLength={500}
          defaultValue={publication.live_stream_url ?? ""}
          placeholder={t("urlPlaceholder")}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("replayUrl")}
        <input
          name="replay_url"
          inputMode="url"
          maxLength={500}
          defaultValue={publication.replay_url ?? ""}
          placeholder={t("urlPlaceholder")}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("highlightsUrl")}
        <input
          name="highlights_url"
          inputMode="url"
          maxLength={500}
          defaultValue={publication.highlights_url ?? ""}
          placeholder={t("urlPlaceholder")}
          className={inputClassName}
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="embed_enabled"
          value="true"
          defaultChecked={publication.embed_enabled}
        />
        {t("embedEnabled")}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("videoTitle")}
        <input
          name="video_title"
          maxLength={300}
          defaultValue={publication.video_title ?? ""}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("liveWindow")}
        <input
          name="live_window_before_min"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_LIVE_WINDOW_BEFORE_MIN}
          step={1}
          defaultValue={publication.live_window_before_min ?? ""}
          className={inputClassName}
        />
      </label>

      {checks ? (
        <section className="flex flex-col gap-3" aria-live="polite">
          <h3 className="text-sm font-semibold">{t("checksTitle")}</h3>
          {checks.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("noVideos")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {checks.map((check) => (
                <VideoRow
                  key={check.field}
                  field={check.field}
                  videoId={check.videoId}
                  status={check.status}
                  title={check.title}
                />
              ))}
            </ul>
          )}
          <p className="text-sm text-zinc-500">{t("channelHint")}</p>
        </section>
      ) : storedVideos.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{t("storedStatus")}</span>
            <StatusBadge
              status={publication.embed_check_status}
              label={t(`statuses.${publication.embed_check_status}`)}
            />
            <span className="text-zinc-500">
              {checkedAtLabel ? t("checkedAt", { time: checkedAtLabel }) : t("notChecked")}
            </span>
          </div>
          <ul className="flex flex-col gap-3">
            {storedVideos.map((row) => (
              <VideoRow
                key={row.field}
                field={row.field}
                videoId={row.videoId}
                status={null}
                title={null}
              />
            ))}
          </ul>
          {publication.video_title ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{publication.video_title}</p>
          ) : null}
        </section>
      ) : null}

      {state.errorKey ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100"
        >
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClassName}>
        {pending ? org("saving") : t("save")}
      </button>
    </form>
  );
}

function VideoRow({
  field,
  videoId,
  status,
  title,
}: {
  field: BroadcastField;
  videoId: string;
  status: MatchEmbedCheckStatus | null;
  title: string | null;
}) {
  const t = useTranslations("matchBroadcast");
  const label = t(`fields.${field}`);
  return (
    <li className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={youTubeThumbnailUrl(videoId)}
        alt={t("thumbnailAlt", { field: label })}
        width={120}
        height={90}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-[68px] w-[120px] shrink-0 rounded-lg object-cover"
      />
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{label}</span>
          {status ? <StatusBadge status={status} label={t(`statuses.${status}`)} /> : null}
        </div>
        {title ? <p className="break-words text-zinc-700 dark:text-zinc-200">{title}</p> : null}
        <a
          href={youTubeWatchUrl(videoId)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-zinc-600 underline underline-offset-2 dark:text-zinc-300"
        >
          {t("openOnYouTube")} <span className="font-mono text-xs">{videoId}</span>
        </a>
      </div>
    </li>
  );
}
