"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ClubCrest } from "@/components/portal/club-crest";
import { MenuIcon, UserIcon } from "@/components/portal/portal-icons";
import { portalAccountHref } from "@/lib/site/portal-auth";
import { PORTAL_NAV } from "@/lib/site/portal-nav";
import { siteConfig } from "@/lib/site/site-config";

type PortalChromeProps = {
  signedIn: boolean;
  clubName: string;
};

export function PortalHeader({ signedIn, clubName }: PortalChromeProps) {
  const t = useTranslations("portal");
  const [open, setOpen] = useState(false);
  const accountHref = portalAccountHref(signedIn);
  const accountLabel = signedIn ? t("nav.app") : t("nav.login");

  return (
    <header className="sticky top-0 z-40 border-b border-club-brand/10 bg-club-cream/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" className="flex min-w-0 items-center gap-2.5" title={clubName}>
          <ClubCrest alt={t("crestAlt")} priority className="h-11 w-auto shrink-0 drop-shadow-sm" />
          <span className="min-w-0 leading-tight">
            <span className="club-wordmark block truncate text-[15px] leading-none text-club-brand sm:text-[17px]">
              {siteConfig.wordmark}
            </span>
            <span className="line-clamp-2 block text-[11px] leading-tight text-club-brand/60">{clubName}</span>
          </span>
        </a>

        <nav className="hidden items-center gap-0.5 xl:flex" aria-label={t("nav.main")}>
          {PORTAL_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-club-brand/75 hover:bg-club-brand/5 hover:text-club-brand"
            >
              {t(`nav.${item.key}`)}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher variant="portal" />
          <Link
            href={accountHref}
            className="hidden items-center gap-1.5 whitespace-nowrap rounded-full bg-club-brand px-4 py-2 text-sm font-semibold text-club-on-brand hover:bg-club-brand/90 sm:inline-flex"
          >
            <UserIcon className="h-4 w-4" />
            {accountLabel}
          </Link>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-club-brand/15 bg-white/70 xl:hidden"
            aria-expanded={open}
            aria-controls="portal-mobile-menu"
            aria-label={t("nav.menu")}
            onClick={() => setOpen((current) => !current)}
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="portal-mobile-menu"
          aria-label={t("nav.mobile")}
          className="mx-auto grid max-w-6xl grid-cols-2 gap-1 border-t border-club-brand/10 px-4 py-3 sm:grid-cols-4 xl:hidden"
        >
          {PORTAL_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-club-brand/5"
              onClick={() => setOpen(false)}
            >
              {t(`nav.${item.key}`)}
            </a>
          ))}
          <Link
            href={accountHref}
            className="col-span-2 mt-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-club-brand px-4 py-3 text-sm font-semibold text-club-on-brand sm:hidden"
            onClick={() => setOpen(false)}
          >
            <UserIcon className="h-4 w-4" />
            {accountLabel}
          </Link>
        </nav>
      ) : null}
    </header>
  );
}

export function PortalStickyBar({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("portal");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry ? !entry.isIntersecting : false);
      },
      { threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-club-brand/10 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition duration-300 lg:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      }`}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
    >
      <div className="mx-auto flex max-w-md gap-2">
        <a href="#enroll" className="club-btn flex-1 rounded-full px-4 py-3 text-center text-sm font-bold">
          {t("mobile.cta")}
        </a>
        <Link
          href={portalAccountHref(signedIn)}
          className="flex-1 rounded-full bg-club-brand px-4 py-3 text-center text-sm font-semibold text-club-on-brand"
        >
          {t("mobile.parents")}
        </Link>
      </div>
    </div>
  );
}
