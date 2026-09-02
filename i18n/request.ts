import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
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
  if (!locale) {
    const paramValue = await rootParams.locale();
    if (hasLocale(routing.locales, paramValue)) {
      locale = paramValue;
    } else {
      notFound();
    }
  }

  const messages = (await messageLoaders[locale as AppLocale]()).default;

  return {
    locale,
    messages,
  };
});
