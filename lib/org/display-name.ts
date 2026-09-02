export type PlayerNameFields = {
  name_zh: string | null;
  name_en_given: string;
  name_en_family: string;
  name_ja: string | null;
};

export function englishPlayerName(
  player: Pick<PlayerNameFields, "name_en_given" | "name_en_family">,
): string {
  return [player.name_en_given, player.name_en_family]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" ");
}

export function localizedPlayerName(player: PlayerNameFields, locale: string): string {
  const zh = player.name_zh?.trim() ?? "";
  const ja = player.name_ja?.trim() ?? "";
  const en = englishPlayerName(player);

  if (locale === "en") {
    return en || zh || ja;
  }
  if (locale === "ja") {
    return ja || en || zh;
  }
  return zh || en || ja;
}

export function playerNameList(player: PlayerNameFields): string {
  return [player.name_zh?.trim(), englishPlayerName(player), player.name_ja?.trim()]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(" · ");
}

export function displayOptionalName(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "—";
}

export function isAppLocale(value: string): value is "zh-Hant" | "en" | "ja" {
  return value === "zh-Hant" || value === "en" || value === "ja";
}
