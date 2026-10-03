import { after } from "next/server";
import {
  buildSiteRevalidateRequest,
  matchRevalidateTags,
  SITE_REVALIDATE_TIMEOUT_MS,
} from "@/lib/site/revalidate";

/**
 * Tells the official site to drop cached data after an admin save. Runs after
 * the response via after(); 3 s timeout; failures are logged only and never
 * fail the admin action. Skips silently when SITE_REVALIDATE_URL or
 * SITE_REVALIDATE_SECRET is unset (server-only env, never NEXT_PUBLIC_*).
 */
export function notifySiteRevalidate(tags: readonly string[]): void {
  const request = buildSiteRevalidateRequest({
    url: process.env.SITE_REVALIDATE_URL,
    secret: process.env.SITE_REVALIDATE_SECRET,
    tags,
  });
  if (!request) {
    return;
  }
  after(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SITE_REVALIDATE_TIMEOUT_MS);
    try {
      const response = await fetch(request.url, {
        ...request.init,
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        console.error("notifySiteRevalidate", response.status);
      }
    } catch (error) {
      console.error(
        "notifySiteRevalidate",
        error instanceof Error ? error.message : "request failed",
      );
    } finally {
      clearTimeout(timer);
    }
  });
}

export function notifySiteMatchesChanged(
  matchIds: readonly string[],
  options: { roster?: boolean } = {},
): void {
  notifySiteRevalidate(matchRevalidateTags(matchIds, options));
}
