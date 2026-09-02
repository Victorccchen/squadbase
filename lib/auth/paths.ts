import { routing, type AppLocale } from "@/i18n/routing";

export function splitLocalePath(pathname: string): {
  locale: AppLocale;
  rest: string;
} {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];

  if (first && routing.locales.includes(first as AppLocale)) {
    const rest = `/${segments.slice(1).join("/")}`;
    return {
      locale: first as AppLocale,
      rest: rest === "/" ? "/" : rest.replace(/\/$/, "") || "/",
    };
  }

  return { locale: routing.defaultLocale, rest: pathname || "/" };
}

export function isAppPath(rest: string): boolean {
  return rest === "/app" || rest.startsWith("/app/");
}

export function isLoginPath(rest: string): boolean {
  return rest === "/login" || rest.startsWith("/login/");
}

/** Only allow in-app relative paths such as /app or /app/.... */
export function safeAppNext(next: string | null | undefined): "/app" | `/app/${string}` {
  if (!next || !next.startsWith("/app")) {
    return "/app";
  }
  if (next === "/app" || next.startsWith("/app/")) {
    if (next.includes("://") || next.startsWith("//") || next.includes("\\")) {
      return "/app";
    }
    return next as "/app" | `/app/${string}`;
  }
  return "/app";
}
