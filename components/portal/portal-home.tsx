import type { CSSProperties } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { PortalHeader, PortalStickyBar } from "@/components/portal/portal-menu";
import { PortalHero } from "@/components/portal/portal-hero";
import { PortalMatches } from "@/components/portal/portal-matches-section";
import {
  PortalAbout,
  PortalCoaches,
  PortalContact,
  PortalFooter,
  PortalNews,
  PortalPrograms,
  PortalTeams,
} from "@/components/portal/portal-static-sections";
import { portalFontClassName } from "@/components/portal/portal-fonts";
import { getAuthUser } from "@/lib/auth/session";
import { listPortalMatchHighlights } from "@/lib/site/portal-match-query";
import { clubNameForLocale, siteCssVariables } from "@/lib/site/site-config";

export async function PortalHome() {
  const t = await getTranslations("portal");
  const locale = await getLocale();
  const highlightsPromise = listPortalMatchHighlights();
  const userPromise = getAuthUser();
  const [highlights, user] = await Promise.all([highlightsPromise, userPromise]);
  const signedIn = Boolean(user);
  const clubName = clubNameForLocale(locale);

  return (
    <div
      className={`portal flex min-h-full flex-1 flex-col ${portalFontClassName}`}
      style={siteCssVariables() as CSSProperties}
    >
      <a
        href="#top"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
      >
        {t("skip")}
      </a>
      <div className="club-stripe" aria-hidden="true" />
      <PortalHeader signedIn={signedIn} clubName={clubName} />
      <main id="top">
        <PortalHero locale={locale} nextMatch={highlights.upcoming[0] ?? null} />
        <PortalAbout />
        <PortalTeams />
        <PortalMatches locale={locale} upcoming={highlights.upcoming} recent={highlights.recent} />
        <PortalPrograms />
        <PortalNews />
        <PortalCoaches />
        <PortalContact />
      </main>
      <div className="club-stripe" aria-hidden="true" />
      <PortalFooter signedIn={signedIn} clubName={clubName} />
      <PortalStickyBar signedIn={signedIn} />
    </div>
  );
}
