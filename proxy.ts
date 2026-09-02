import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/proxy";

const handleI18nRouting = createIntlMiddleware(routing);

export default async function proxy(request: NextRequest) {
  // Locale negotiation first so auth redirects keep the URL prefix.
  const response = handleI18nRouting(request);
  return updateSession(request, response);
}

export const config = {
  // Skip API, Next internals, and files with an extension (icons, manifest).
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
