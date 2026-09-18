/**
 * Locale helpers that Server Actions can use without next/root-params.
 *
 * `next/root-params` `.locale()` throws during the Server Action phase.
 * next-intl's getRequestConfig used to call that unconditionally, which
 * crashed match CSV preview (import error boundary + digest).
 */

import { hasLocale } from "next-intl";
import { routing, type AppLocale } from "./routing";

export function localeFromPathname(pathname: string): AppLocale | null {
  const first = pathname.split("/").find(Boolean);
  return first && hasLocale(routing.locales, first) ? first : null;
}

export function localeFromHeaderValue(value: string | null | undefined): AppLocale | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? new URL(trimmed)
      : new URL(trimmed, "http://local.invalid");
    return localeFromPathname(url.pathname);
  } catch {
    return localeFromPathname(trimmed);
  }
}

export function isRootParamsRouteContextError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message;
  return (
    message.includes("inside a Server Action") ||
    message.includes("inside a Route Handler") ||
    message.includes("outside of a Server Component")
  );
}
