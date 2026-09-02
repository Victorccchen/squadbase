import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Skip API, Next internals, and files with an extension (icons, manifest).
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
