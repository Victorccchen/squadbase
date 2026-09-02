"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

const localeLabels: Record<AppLocale, string> = {
  "zh-Hant": "繁中",
  en: "EN",
  ja: "日本語",
};

export function LanguageSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("languageLabel")} className="flex items-center gap-1">
      {routing.locales.map((code) => {
        const isActive = code === locale;
        return (
          <Link
            key={code}
            href={pathname}
            locale={code}
            hrefLang={code}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background"
                : "rounded-full px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-black/5 dark:hover:bg-white/10"
            }
          >
            {localeLabels[code]}
          </Link>
        );
      })}
    </nav>
  );
}
