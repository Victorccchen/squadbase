import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound, unstable_rethrow } from "next/navigation";
import * as rootParams from "next/root-params";
import { localeForRedirect } from "./locale-for-redirect";
import { routing, type AppLocale } from "./routing";

const messageLoaders: Record<
  AppLocale,
  () => Promise<{ default: Record<string, unknown> }>
> = {
  "zh-Hant": () => import("../messages/zh-Hant.json"),
  en: () => import("../messages/en.json"),
  ja: () => import("../messages/ja.json"),
};

export default getRequestConfig(async ({ locale }) => {
  let resolved: string | undefined = locale;

  if (!resolved) {
    try {
      const paramValue = await rootParams.locale();
      if (hasLocale(routing.locales, paramValue)) {
        resolved = paramValue;
      } else {
        notFound();
      }
    } catch (error) {
      unstable_rethrow(error);
      resolved = await localeForRedirect();
    }
  }

  if (!hasLocale(routing.locales, resolved)) {
    notFound();
  }

  const messages = (await messageLoaders[resolved]()).default;

  return {
    locale: resolved,
    messages,
  };
});
