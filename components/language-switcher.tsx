"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

const localeLabels: Record<AppLocale, string> = {
  "zh-Hant": "繁中",
  en: "EN",
  ja: "日本語",
};

/** Portal header follows the club mockup: 繁中, 日本語, EN. */
const portalLocaleOrder: readonly AppLocale[] = ["zh-Hant", "ja", "en"];

type LanguageSwitcherProps = {
  variant?: "default" | "portal";
};

export function LanguageSwitcher({ variant = "default" }: LanguageSwitcherProps) {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const portal = variant === "portal";

  return (
    <nav
      aria-label={t("languageLabel")}
      className={
        portal
          ? "flex items-center rounded-full border border-club-brand/15 bg-white/70 p-0.5"
          : "flex items-center gap-1"
      }
    >
      {(portal ? portalLocaleOrder : routing.locales).map((code) => {
        const isActive = code === locale;
        const portalClass = isActive
          ? "rounded-full bg-club-brand px-2 py-1 text-[11px] font-semibold text-club-on-brand sm:px-2.5 sm:text-xs"
          : "rounded-full px-2 py-1 text-[11px] font-semibold text-club-brand/80 hover:bg-club-brand/5 sm:px-2.5 sm:text-xs";
        const defaultClass = isActive
          ? "rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          : "rounded-full px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-black/5 dark:hover:bg-white/10";
        return (
          <Link
            key={code}
            href={pathname}
            locale={code}
            hrefLang={code}
            aria-current={isActive ? "page" : undefined}
            className={portal ? portalClass : defaultClass}
          >
            {localeLabels[code]}
          </Link>
        );
      })}
    </nav>
  );
}
