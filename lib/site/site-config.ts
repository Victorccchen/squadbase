import { routing, type AppLocale } from "@/i18n/routing";

/**
 * Public club brand tokens. Colours and the crest are sampled from the
 * club's TFAF crest and are pending club approval — swap this module
 * (and the files it points at) to restyle the portal.
 */
export const siteConfig = {
  clubName: {
    "zh-Hant": "台中 Futuro 足球俱樂部",
    ja: "台中 Futuro サッカークラブ",
    en: "Taichung Futuro FC",
  } satisfies Record<AppLocale, string>,
  shortName: "台中FUTURO",
  wordmark: "FUTURO",
  motto: {
    lead: "FUTURO",
    accent: "= Future",
  },
  crest: {
    src: "/brand/futuro-crest.png",
    width: 323,
    height: 400,
  },
  /** Locale home metadata only. App-wide PWA icons stay on the manifest. */
  favicon: {
    src: "/brand/favicon.png",
  },
  timeZone: "Asia/Taipei",
  colors: {
    brand: "#002F7B",
    brandDeep: "#001B4A",
    scarlet: "#B81C22",
    gold: "#D4AB0A",
    gold2: "#EDD886",
    cream: "#F7F5EF",
    onBrand: "#FFFFFF",
    onScarlet: "#FFFFFF",
    placeholderFrom: "#e9e7e0",
    placeholderTo: "#dcd9cf",
    placeholderDarkFrom: "#0d3d8c",
    placeholderDarkTo: "#002566",
  },
  fonts: {
    sans: 'var(--font-jost), var(--font-noto-tc), var(--font-noto-jp), "PingFang TC", "Hiragino Sans", ui-sans-serif, system-ui, sans-serif',
    display:
      'var(--font-jost), var(--font-noto-tc), var(--font-noto-jp), "PingFang TC", "Hiragino Sans", sans-serif',
  },
  hero: {
    cut: "48px",
    cutSm: "28px",
    starOpacity: "0.10",
    pitchOpacity: "0.06",
  },
  /** Null until the club supplies a real URL. */
  links: {
    mapUrl: null as string | null,
    email: null as string | null,
    line: null as string | null,
    instagram: null as string | null,
    facebook: null as string | null,
  },
} as const;

export function clubNameForLocale(locale: string): string {
  if ((routing.locales as readonly string[]).includes(locale)) {
    return siteConfig.clubName[locale as AppLocale];
  }
  return siteConfig.clubName[routing.defaultLocale];
}

/** Inline custom properties. Components read these — not raw hex values. */
export function siteCssVariables(): Record<string, string> {
  const { colors, fonts, hero } = siteConfig;
  return {
    "--club-brand": colors.brand,
    "--club-brand-deep": colors.brandDeep,
    "--club-scarlet": colors.scarlet,
    "--club-gold": colors.gold,
    "--club-gold-2": colors.gold2,
    "--club-cream": colors.cream,
    "--club-on-brand": colors.onBrand,
    "--club-on-scarlet": colors.onScarlet,
    "--club-ph-from": colors.placeholderFrom,
    "--club-ph-to": colors.placeholderTo,
    "--club-ph-dark-from": colors.placeholderDarkFrom,
    "--club-ph-dark-to": colors.placeholderDarkTo,
    "--club-font-sans": fonts.sans,
    "--club-font-display": fonts.display,
    "--club-hero-cut": hero.cut,
    "--club-hero-cut-sm": hero.cutSm,
    "--club-hero-star-opacity": hero.starOpacity,
    "--club-hero-pitch-opacity": hero.pitchOpacity,
    "--club-focus": colors.gold2,
  };
}
