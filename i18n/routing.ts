import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["zh-Hant", "en", "ja"],
  defaultLocale: "zh-Hant",
  localePrefix: "always",
  // Stage 0: always land on Traditional Chinese unless the URL has a locale.
  localeDetection: false,
});

export type AppLocale = (typeof routing.locales)[number];
