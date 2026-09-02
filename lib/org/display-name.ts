import type { AppLocale } from "@/i18n/routing";

export function localizedPlayerName(
  player: {
    name_zh: string;
    name_en: string;
    name_ja: string;
  },
  locale: string,
): string {
  if (locale === "en") {
    return player.name_en || player.name_zh || player.name_ja;
  }
  if (locale === "ja") {
    return player.name_ja || player.name_zh || player.name_en;
  }
  return player.name_zh || player.name_en || player.name_ja;
}

export function isAppLocale(value: string): value is AppLocale {
  return value === "zh-Hant" || value === "en" || value === "ja";
}
