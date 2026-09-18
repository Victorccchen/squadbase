import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { localeFromHeaderValue } from "./request-locale";
import { routing, type AppLocale } from "./routing";

/** Locale for Server Action redirects. Does not call next/root-params. */
export async function localeForRedirect(): Promise<AppLocale> {
  try {
    const headerList = await headers();
    return (
      localeFromHeaderValue(headerList.get("next-url")) ??
      localeFromHeaderValue(headerList.get("referer")) ??
      localeFromHeaderValue(headerList.get("x-url")) ??
      routing.defaultLocale
    );
  } catch (error) {
    unstable_rethrow(error);
    return routing.defaultLocale;
  }
}
