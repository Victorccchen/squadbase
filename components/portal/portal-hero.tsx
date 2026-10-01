import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowIcon, CalendarIcon } from "@/components/portal/portal-icons";
import { PhotoSlot } from "@/components/portal/portal-ui";
import { publicOpponentLabel } from "@/lib/org/match";
import { formatPortalKickoff } from "@/lib/site/portal-matches";
import { siteConfig } from "@/lib/site/site-config";
import type { PublishedMatch } from "@/lib/supabase/database.types";

type PortalHeroProps = {
  locale: string;
  nextMatch: PublishedMatch | null;
};

export async function PortalHero({ locale, nextMatch }: PortalHeroProps) {
  const t = await getTranslations("portal");
  const kickoff = nextMatch
    ? formatPortalKickoff(nextMatch.starts_at, locale, siteConfig.timeZone)
    : null;
  const opponent = nextMatch
    ? publicOpponentLabel(nextMatch.opponent, t("matches.opponentTbd"))
    : "";

  return (
    <section id="hero" className="relative bg-club-cream">
      <div className="club-hero-shape pointer-events-none absolute inset-0 overflow-hidden text-club-on-brand" aria-hidden="true">
        <div
          className="club-stars absolute inset-y-0 left-0 w-full lg:w-1/2"
          style={{ opacity: "var(--club-hero-star-opacity)" }}
        />
        <div className="club-hero-panel absolute inset-y-0 right-0 hidden w-[38%] lg:block" />
        <div className="club-hero-panel-edge absolute inset-y-0 right-0 hidden w-[38%] lg:block" />
        <div className="club-hero-panel-mobile absolute right-0 bottom-0 h-40 w-[70%] lg:hidden" />
        <svg
          className="club-pitch absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 1200 700"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        >
          <rect x="40" y="40" width="1120" height="620" rx="4" />
          <line x1="600" y1="40" x2="600" y2="660" />
          <circle cx="600" cy="350" r="95" />
          <circle cx="600" cy="350" r="5" fill="currentColor" />
          <rect x="40" y="200" width="160" height="300" />
          <rect x="40" y="275" width="60" height="150" />
          <rect x="1000" y="200" width="160" height="300" />
          <rect x="1100" y="275" width="60" height="150" />
          <path d="M200 290 A70 70 0 0 1 200 410" />
          <path d="M1000 290 A70 70 0 0 0 1000 410" />
        </svg>
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-24 sm:px-6 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-20 lg:pb-32">
        <div className="text-club-on-brand">
          <p className="club-eyebrow inline-flex items-center gap-2 border-l-4 border-club-scarlet bg-white/5 px-3 py-1 text-xs font-semibold text-club-gold-2">
            <span className="club-sun" aria-hidden="true" />
            {t("hero.eyebrow")}
          </p>
          <h1 className="mt-5 text-[2.5rem] leading-[1.12] font-black tracking-tight whitespace-pre-line italic sm:text-5xl lg:text-6xl">
            {t("hero.title")}
            <span className="text-club-gold">{t("hero.titleAccent")}</span>
            {t("hero.titleTail")}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/75 sm:text-lg sm:leading-8">{t("hero.lead")}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a href="#enroll" className="club-btn inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-bold">
              {t("hero.ctaTrial")}
              <ArrowIcon className="h-4 w-4" />
            </a>
            <Link
              href="/matches"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 px-6 py-3.5 text-base font-semibold text-white hover:bg-white/10"
            >
              <CalendarIcon className="h-4 w-4" />
              {t("hero.ctaFixtures")}
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-2 text-xs font-medium text-white/80 sm:text-sm">
            <li className="rounded-full bg-white/10 px-3 py-1.5">{t("hero.chip1")}</li>
            <li className="rounded-full bg-white/10 px-3 py-1.5">{t("hero.chip2")}</li>
            <li className="rounded-full bg-white/10 px-3 py-1.5">{t("hero.chip3")}</li>
          </ul>
        </div>

        <div className="relative">
          <PhotoSlot
            dark
            label={t("hero.photo")}
            hint={t("hero.photoHint")}
            className="club-gold-rim aspect-[4/3] w-full rounded-3xl"
          />
          {nextMatch && kickoff ? (
            <Link
              href={`/matches/${nextMatch.id}`}
              className="club-card absolute -bottom-7 right-4 left-4 flex items-center gap-3 rounded-2xl border-t-4 border-club-gold bg-white p-3 text-club-brand shadow-xl sm:right-6 sm:left-auto sm:w-80"
            >
              <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-club-gold py-1.5 text-club-brand">
                <span className="text-[10px] font-bold">{kickoff.month}</span>
                <span className="text-xl leading-none font-black">{kickoff.day}</span>
                <span className="text-[10px] font-semibold">{kickoff.weekday}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold tracking-wide text-club-brand/50 uppercase">{t("hero.next")}</p>
                <p className="mt-0.5 truncate text-sm font-bold">
                  {nextMatch.team_name} {t("matches.versus")} {opponent}
                </p>
                <p className="text-xs text-club-brand/60">
                  {kickoff.time} · {kindLabel(nextMatch.kind, t)}
                </p>
              </div>
            </Link>
          ) : (
            <div className="absolute -bottom-7 right-4 left-4 rounded-2xl border-t-4 border-club-gold bg-white p-4 text-club-brand shadow-xl sm:right-6 sm:left-auto sm:w-80">
              <p className="text-[11px] font-bold tracking-wide text-club-brand/50 uppercase">{t("hero.next")}</p>
              <p className="mt-1 text-sm font-semibold">{t("hero.nextEmpty")}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function kindLabel(
  kind: PublishedMatch["kind"],
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  switch (kind) {
    case "league":
    case "cup":
    case "friendly":
      return t(`matches.kind.${kind}`);
    case "regular":
    case "special":
      return t("matches.kind.other");
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}
