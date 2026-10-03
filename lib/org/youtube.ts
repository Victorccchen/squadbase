/**
 * YouTube helpers for the admin 「直播與影片」 section (spec v4 §5.4, §5.6).
 *
 * Only the 11-character video id is stored and sent to the official site; the
 * pasted URL is kept for reference only and never placed into an iframe.
 */

import type { MatchEmbedCheckStatus } from "../supabase/database.types.ts";

export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
export const MAX_VIDEO_URL_LENGTH = 500;
export const MAX_VIDEO_TITLE_LENGTH = 300;
export const MAX_LIVE_WINDOW_BEFORE_MIN = 180;
export const YOUTUBE_OEMBED_TIMEOUT_MS = 3000;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);

/** Path prefixes whose next segment is the video id. */
const ID_PATH_PREFIXES = new Set(["live", "embed", "shorts", "v", "e"]);

export function isYouTubeVideoId(value: string): boolean {
  return YOUTUBE_VIDEO_ID_PATTERN.test(value);
}

function asVideoId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return isYouTubeVideoId(trimmed) ? trimmed : null;
}

/**
 * Returns the 11-character video id for a single-video YouTube URL, or null.
 *
 * Accepts watch?v=, youtu.be/, /live/, /embed/, /shorts/ (www, m., nocookie)
 * with extra query params. Rejects channels, playlists without a video,
 * non-YouTube hosts and non-http(s) schemes.
 */
export function parseYouTubeVideoId(input: string | null | undefined): string | null {
  const raw = input?.trim() ?? "";
  if (!raw || raw.length > MAX_VIDEO_URL_LENGTH) {
    return null;
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (SHORT_HOSTS.has(host)) {
    return segments.length === 1 ? asVideoId(segments[0]) : null;
  }

  if (!YOUTUBE_HOSTS.has(host)) {
    return null;
  }

  if (segments.length === 1 && segments[0] === "watch") {
    return asVideoId(url.searchParams.get("v"));
  }

  if (segments.length === 2 && ID_PATH_PREFIXES.has(segments[0])) {
    return asVideoId(segments[1]);
  }

  return null;
}

export type OEmbedCheck = {
  status: MatchEmbedCheckStatus;
  title: string | null;
};

/** Maps the oEmbed HTTP status to the stored check status (§5.4). */
export function embedStatusFromHttpStatus(httpStatus: number): MatchEmbedCheckStatus {
  if (httpStatus >= 200 && httpStatus < 300) {
    return "ok";
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return "blocked";
  }
  if (httpStatus === 404 || httpStatus === 400) {
    return "not_found";
  }
  return "unknown";
}

export function youTubeOEmbedUrl(videoId: string): string {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
}

export function youTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Worst status wins so the admin sees a problem with any video:
 * blocked > not_found > unknown > ok. No videos → unknown.
 */
export function combineEmbedStatuses(
  statuses: readonly MatchEmbedCheckStatus[],
): MatchEmbedCheckStatus {
  if (statuses.length === 0) {
    return "unknown";
  }
  for (const status of ["blocked", "not_found", "unknown"] as const) {
    if (statuses.includes(status)) {
      return status;
    }
  }
  return "ok";
}

/**
 * Server-side oEmbed check. Network errors and timeouts return unknown;
 * the result is advisory and never blocks saving.
 */
export async function checkYouTubeEmbed(
  videoId: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<OEmbedCheck> {
  if (!isYouTubeVideoId(videoId)) {
    return { status: "not_found", title: null };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? YOUTUBE_OEMBED_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(youTubeOEmbedUrl(videoId), {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    const status = embedStatusFromHttpStatus(response.status);
    if (status !== "ok") {
      return { status, title: null };
    }
    let title: string | null = null;
    try {
      const body = (await response.json()) as { title?: unknown };
      if (typeof body.title === "string" && body.title.trim()) {
        title = body.title.trim().slice(0, MAX_VIDEO_TITLE_LENGTH);
      }
    } catch {
      title = null;
    }
    return { status, title };
  } catch {
    return { status: "unknown", title: null };
  } finally {
    clearTimeout(timer);
  }
}

export type BroadcastField = "live" | "replay" | "highlights";
export const BROADCAST_FIELDS = ["live", "replay", "highlights"] as const;

export type ParsedBroadcastForm =
  | {
      ok: true;
      urls: Record<BroadcastField, string | null>;
      ids: Record<BroadcastField, string | null>;
      embedEnabled: boolean;
      videoTitle: string | null;
      liveWindowBeforeMin: number | null;
    }
  | { ok: false; errorKey: "invalidVideoUrl" | "invalidLiveWindow"; field?: BroadcastField };

/** Validates the raw form values of the broadcast section (pure). */
export function parseBroadcastForm(input: {
  live: string;
  replay: string;
  highlights: string;
  embedEnabled: boolean;
  videoTitle: string;
  liveWindowBeforeMin: string;
}): ParsedBroadcastForm {
  const urls = { live: null, replay: null, highlights: null } as Record<BroadcastField, string | null>;
  const ids = { live: null, replay: null, highlights: null } as Record<BroadcastField, string | null>;
  for (const field of BROADCAST_FIELDS) {
    const raw = input[field].trim();
    if (!raw) {
      continue;
    }
    const id = parseYouTubeVideoId(raw);
    if (!id) {
      return { ok: false, errorKey: "invalidVideoUrl", field };
    }
    urls[field] = raw;
    ids[field] = id;
  }

  const windowRaw = input.liveWindowBeforeMin.trim();
  let liveWindowBeforeMin: number | null = null;
  if (windowRaw) {
    if (!/^\d{1,3}$/.test(windowRaw)) {
      return { ok: false, errorKey: "invalidLiveWindow" };
    }
    const n = Number(windowRaw);
    if (n < 0 || n > MAX_LIVE_WINDOW_BEFORE_MIN) {
      return { ok: false, errorKey: "invalidLiveWindow" };
    }
    liveWindowBeforeMin = n;
  }

  const title = input.videoTitle.trim();
  return {
    ok: true,
    urls,
    ids,
    embedEnabled: input.embedEnabled,
    videoTitle: title ? title.slice(0, MAX_VIDEO_TITLE_LENGTH) : null,
    liveWindowBeforeMin,
  };
}

export type MatchBroadcastCheck = {
  field: BroadcastField;
  videoId: string;
  status: MatchEmbedCheckStatus;
  title: string | null;
};

/** Default video title: the admin's text, else the first oEmbed title (live, replay, highlights). */
export function pickVideoTitle(
  adminTitle: string | null,
  checks: readonly MatchBroadcastCheck[],
): string | null {
  if (adminTitle) {
    return adminTitle;
  }
  for (const field of BROADCAST_FIELDS) {
    const title = checks.find((check) => check.field === field && check.title)?.title;
    if (title) {
      return title.slice(0, MAX_VIDEO_TITLE_LENGTH);
    }
  }
  return null;
}
