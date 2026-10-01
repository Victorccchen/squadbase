import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ClubCrest } from "@/components/portal/club-crest";
import {
  ArrowIcon,
  CheckIcon,
  FacebookIcon,
  InstagramIcon,
  LineIcon,
  ShieldIcon,
  UserIcon,
} from "@/components/portal/portal-icons";
import { PhotoSlot, PortalEyebrow } from "@/components/portal/portal-ui";
import { portalAccountHref } from "@/lib/site/portal-auth";
import { formatPortalDate } from "@/lib/site/portal-matches";
import { siteConfig } from "@/lib/site/site-config";

const NEWS = [
  { id: "n1", category: "enroll" },
  { id: "n2", category: "match" },
  { id: "n3", category: "notice" },
] as const;
const NEWS_BADGE = {
  enroll: "bg-club-gold text-club-brand",
  match: "bg-sky-100 text-sky-900",
  notice: "bg-amber-100 text-amber-900",
} as const;
const COACHES = ["head", "u12", "u10", "u8"] as const;
const STEPS = [1, 2, 3, 4] as const;

export async function PortalAbout() {
  const t = await getTranslations("portal");
  return (
    <section id="about" className="pt-20 pb-16 sm:pt-24 sm:pb-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <PortalEyebrow>{t("about.eyebrow")}</PortalEyebrow>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{t("about.title")}</h2>
            <div className="mt-6 rounded-2xl border-l-4 border-club-scarlet bg-white p-5 shadow-sm">
              <p className="text-xs font-bold tracking-[0.14em] text-club-brand/50 uppercase">{t("about.missionLabel")}</p>
              <p className="mt-2 text-base leading-8 text-club-brand/80">{t("about.mission")}</p>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-3">
            <PhotoSlot
              label={t("about.photo1")}
              hint={t("about.photo1Hint")}
              className="col-span-3 aspect-[3/4] rounded-3xl"
            />
            <div className="col-span-2 flex flex-col gap-3">
              <PhotoSlot label={t("about.photo2")} className="flex-1 rounded-3xl" />
              <div className="club-quarter club-gold-rim relative flex flex-1 flex-col justify-start overflow-hidden rounded-3xl p-4 text-white">
                <div className="club-stars absolute bottom-0 left-0 h-1/2 w-1/2 opacity-80" aria-hidden="true" />
                <ClubCrest alt="" className="absolute right-3 bottom-3 h-12 w-auto drop-shadow sm:h-14" />
                <p className="relative text-lg leading-tight font-black italic">
                  <span className="club-wordmark not-italic">{siteConfig.motto.lead}</span>
                  <br />
                  <span className="text-club-gold-2">{siteConfig.motto.accent}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <ValueCard title={t("about.v1t")} body={t("about.v1b")} icon="joy" />
          <ValueCard title={t("about.v2t")} body={t("about.v2b")} icon="growth" />
          <ValueCard title={t("about.v3t")} body={t("about.v3b")} icon="team" />
        </div>
      </div>
    </section>
  );
}

function ValueCard({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: "joy" | "growth" | "team";
}) {
  return (
    <article className="club-card flex gap-4 rounded-2xl border border-club-brand/10 bg-white p-5 sm:block sm:p-6">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-club-brand text-club-gold ring-2 ring-club-gold/60 ring-offset-2">
        <ValueIcon icon={icon} />
      </div>
      <div>
        <h3 className="text-lg font-bold sm:mt-4">{title}</h3>
        <p className="mt-1 text-sm leading-7 text-club-brand/70 sm:mt-2">{body}</p>
      </div>
    </article>
  );
}

function ValueIcon({ icon }: { icon: "joy" | "growth" | "team" }) {
  const className = "h-6 w-6";
  switch (icon) {
    case "joy":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" />
        </svg>
      );
    case "growth":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 18l5-5 4 4 7-8" />
          <path d="M15 9h5v5" />
        </svg>
      );
    case "team":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15 14c3 0 6 1.8 6 5" />
        </svg>
      );
    default: {
      const neverIcon: never = icon;
      return neverIcon;
    }
  }
}

const PATHWAY_STAGES = [
  { id: "u8", learn: ["l1", "l2", "l3"], open: true },
  { id: "golden", learn: ["l1", "l2", "l3", "l4", "l5", "l6", "l7"], open: true },
  { id: "later", learn: ["l1", "l2", "l3", "l4", "l5", "l6"], open: false },
  { id: "senior", learn: ["l1", "l2", "l3", "l4", "l5", "l6", "l7"], open: false },
] as const;

type PathwayStage = (typeof PATHWAY_STAGES)[number];

const CHART_AGES = ["u6", "u8", "u10", "u12", "u13", "u14", "u15", "u16", "u17", "u18"] as const;
const CHART_AGE_LABEL: Record<(typeof CHART_AGES)[number], string> = {
  u6: "U-6",
  u8: "U-8",
  u10: "U-10",
  u12: "U-12",
  u13: "U-13",
  u14: "U-14",
  u15: "U-15",
  u16: "U-16",
  u17: "U-17",
  u18: "U-18",
};

const CHART_LEVELS = ["none", "light", "mid", "strong"] as const;
type ChartLevel = (typeof CHART_LEVELS)[number];

/**
 * Simplified reading of the club chart. The PDF uses a smooth blue gradient,
 * darker where that quality is emphasised. These four steps are approximate
 * where the colour fades.
 */
const CHART_ROWS: { id: "touch" | "moving" | "individual" | "group" | "coordination" | "endurance" | "strength" | "mindset"; cells: readonly ChartLevel[] }[] = [
  { id: "touch", cells: ["mid", "mid", "mid", "mid", "mid", "light", "light", "light", "light", "none"] },
  { id: "moving", cells: ["strong", "strong", "strong", "strong", "strong", "strong", "strong", "strong", "mid", "mid"] },
  { id: "individual", cells: ["mid", "strong", "strong", "strong", "strong", "strong", "strong", "mid", "mid", "light"] },
  { id: "group", cells: ["light", "light", "light", "light", "mid", "mid", "mid", "mid", "strong", "strong"] },
  { id: "coordination", cells: ["mid", "mid", "mid", "mid", "mid", "mid", "light", "light", "light", "none"] },
  { id: "endurance", cells: ["none", "light", "light", "mid", "mid", "strong", "strong", "strong", "mid", "light"] },
  { id: "strength", cells: ["none", "none", "none", "none", "light", "mid", "mid", "mid", "strong", "strong"] },
  { id: "mindset", cells: ["light", "light", "light", "light", "mid", "mid", "mid", "mid", "mid", "strong"] },
];

function chartLevelClass(level: ChartLevel): string {
  switch (level) {
    case "none":
      return "bg-club-brand/5 text-club-brand/45";
    case "light":
      return "bg-club-brand/15 text-club-brand";
    case "mid":
      return "bg-club-brand/35 text-club-brand";
    case "strong":
      return "bg-club-brand text-white";
    default: {
      const neverLevel: never = level;
      return neverLevel;
    }
  }
}

export async function PortalTeams() {
  const t = await getTranslations("portal");
  return (
    <section id="teams" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PortalEyebrow>{t("teams.eyebrow")}</PortalEyebrow>
        <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{t("teams.title")}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-club-brand/75 sm:text-base">{t("teams.lead")}</p>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-club-brand sm:text-base">{t("teams.foundation")}</p>
        <p className="mt-4 max-w-3xl rounded-2xl border border-club-gold/50 bg-club-gold/10 px-4 py-3 text-sm leading-7 font-semibold text-club-brand">
          <span className="mr-1 text-club-gold" aria-hidden="true">☆</span>
          <span className="sr-only">{t("teams.mottoLabel")} </span>
          {t("teams.motto")}
        </p>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-club-brand/70">{t("teams.openNow")}</p>

        <div className="mt-8 space-y-3 md:hidden">
          {PATHWAY_STAGES.map((stage) => (
            <PathwayDetails key={stage.id} stage={stage} />
          ))}
        </div>
        <div className="mt-10 hidden gap-5 md:grid md:grid-cols-2">
          {PATHWAY_STAGES.map((stage) => (
            <PathwayArticle key={stage.id} stage={stage} />
          ))}
        </div>

        <PathwayChart />
      </div>
    </section>
  );
}

async function PathwayDetails({ stage }: { stage: PathwayStage }) {
  const t = await getTranslations("portal");
  return (
    <details className="group rounded-3xl border border-club-brand/10 bg-club-cream">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
        <span className={`mt-0.5 inline-flex shrink-0 -skew-x-6 rounded-lg px-2.5 py-1 text-sm font-black tracking-tight italic ${stage.open ? "bg-club-gold text-club-brand" : "bg-club-brand text-club-gold"}`}>
          {t(`teams.stages.${stage.id}.age`)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-black leading-snug">{t(`teams.stages.${stage.id}.name`)}</span>
          <span className="mt-1 block text-sm leading-6 text-club-brand/70">{t(`teams.stages.${stage.id}.theme`)}</span>
        </span>
        <span className="mt-1 text-club-brand/50 transition group-open:rotate-90" aria-hidden="true">▸</span>
      </summary>
      <div className="px-4 pb-4">
        <PathwayBody stage={stage} />
      </div>
    </details>
  );
}

async function PathwayArticle({ stage }: { stage: PathwayStage }) {
  const t = await getTranslations("portal");
  return (
    <article className="club-card flex flex-col rounded-3xl border border-club-brand/10 bg-club-cream p-6">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex -skew-x-6 rounded-lg px-3 py-1.5 text-lg font-black tracking-tight italic ${stage.open ? "bg-club-gold text-club-brand" : "bg-club-brand text-club-gold"}`}>
          {t(`teams.stages.${stage.id}.age`)}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stage.open ? "bg-club-gold/25 text-club-brand" : "bg-club-brand/10 text-club-brand/70"}`}>
          {t(`teams.stages.${stage.id}.badge`)}
        </span>
      </div>
      <h3 className="mt-4 text-xl font-black">{t(`teams.stages.${stage.id}.name`)}</h3>
      <p className="mt-2 text-sm leading-7 font-semibold text-club-brand/80">{t(`teams.stages.${stage.id}.theme`)}</p>
      <PathwayBody stage={stage} />
    </article>
  );
}

async function PathwayBody({ stage }: { stage: PathwayStage }) {
  const t = await getTranslations("portal");
  return (
    <div>
      <p className="mt-3 text-sm leading-7 text-club-brand/75 md:mt-4">{t(`teams.stages.${stage.id}.body`)}</p>
      <p className="mt-4 text-xs font-bold tracking-[0.14em] text-club-brand/50 uppercase">{t("teams.learning")}</p>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-club-brand/85">
        {stage.learn.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-club-scarlet" aria-hidden="true" />
            <span>{t(`teams.stages.${stage.id}.${item}`)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs font-bold tracking-[0.14em] text-club-brand/50 uppercase">{t("teams.practice")}</p>
      <p className="mt-2 text-sm leading-7 text-club-brand/80">{t(`teams.stages.${stage.id}.practiceBody`)}</p>
      <p className="mt-4 text-sm leading-6 font-semibold text-club-brand">
        <span className="text-club-gold" aria-hidden="true">☆ </span>
        {t("teams.motto")}
      </p>
      <p className="mt-3 text-xs font-semibold text-club-brand/60 md:hidden">{t(`teams.stages.${stage.id}.badge`)}</p>
    </div>
  );
}

async function PathwayChart() {
  const t = await getTranslations("portal");
  return (
    <div className="mt-14">
      <h3 className="text-2xl font-black tracking-tight">{t("teams.chartTitle")}</h3>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-club-brand/70">{t("teams.chartLead")}</p>
      <p className="mt-2 text-xs font-semibold text-club-brand/50 md:hidden">{t("teams.chartSwipe")}</p>
      <div className="mt-5 max-w-full overflow-x-auto">
        <table className="w-full min-w-[44rem] border-separate border-spacing-1 text-center text-xs">
          <caption className="sr-only">{t("teams.chartLead")}</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-2 text-left font-semibold text-club-brand/60">
                {t("teams.chartAges")}
              </th>
              {CHART_AGES.map((age) => (
                <th
                  key={age}
                  scope="col"
                  className={`px-1 py-2 font-black tracking-tight ${age === "u14" ? "rounded-t-lg bg-club-gold/25 text-club-brand" : "text-club-brand/70"}`}
                >
                  <span className="block">{CHART_AGE_LABEL[age]}</span>
                  {age === "u14" ? <span className="mt-0.5 block text-[10px] font-bold text-club-brand">{t("teams.u14mark")}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHART_ROWS.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-semibold text-club-brand">
                  {t(`teams.rows.${row.id}`)}
                </th>
                {row.cells.map((level, index) => {
                  const age = CHART_AGES[index];
                  if (!age) {
                    return null;
                  }
                  return (
                    <td
                      key={age}
                      className={`rounded-md px-1 py-2 font-bold ${chartLevelClass(level)} ${age === "u14" ? "ring-2 ring-club-gold" : ""}`}
                      title={t(`teams.levelName.${level}`)}
                    >
                      <span className="sr-only">{CHART_AGE_LABEL[age]} </span>
                      {t(`teams.levels.${level}`)}
                      <span className="sr-only"> {t(`teams.levelName.${level}`)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2 text-xs text-club-brand/70">
        {CHART_LEVELS.map((level) => (
          <li key={level} className={`rounded-full px-2.5 py-1 font-semibold ${chartLevelClass(level)}`}>
            {t(`teams.levels.${level}`)} {t(`teams.levelName.${level}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function PortalPrograms() {
  const t = await getTranslations("portal");
  return (
    <section id="programs" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PortalEyebrow>{t("programs.eyebrow")}</PortalEyebrow>
        <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{t("programs.title")}</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <article className="club-card flex flex-col rounded-3xl border border-club-brand/10 bg-club-cream p-6 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-club-brand text-club-gold">
                <CalendarIconLarge />
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                {t("programs.tagRegular")}
              </span>
            </div>
            <h3 className="mt-5 text-xl font-black">{t("programs.regularT")}</h3>
            <p className="mt-2 text-sm leading-7 text-club-brand/70">{t("programs.regularB")}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <CheckItem tone="emerald">{t("programs.r1")}</CheckItem>
              <CheckItem tone="emerald">{t("programs.r2")}</CheckItem>
              <CheckItem tone="emerald">{t("programs.r3")}</CheckItem>
            </ul>
            <p className="mt-auto pt-6 text-sm font-semibold">
              <span className="club-sample rounded-md px-2 py-1">{t("programs.fee")}</span>
            </p>
          </article>

          <article className="club-card relative flex flex-col overflow-hidden rounded-3xl bg-club-brand p-6 text-white sm:p-7">
            <div className="club-stars pointer-events-none absolute -right-4 -bottom-4 hidden h-36 w-44 opacity-[0.18] sm:block" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-club-gold text-club-brand">
                <CampIcon />
              </div>
              <span className="rounded-full bg-club-gold/20 px-2.5 py-1 text-xs font-semibold text-club-gold">
                {t("programs.tagCamp")}
              </span>
            </div>
            <h3 className="mt-5 text-xl font-black">{t("programs.campT")}</h3>
            <p className="mt-2 text-sm leading-7 text-white/70">{t("programs.campB")}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-white/90">
              <CheckItem tone="gold">{t("programs.c1")}</CheckItem>
              <CheckItem tone="gold">{t("programs.c2")}</CheckItem>
              <CheckItem tone="gold">{t("programs.c3")}</CheckItem>
            </ul>
            <p className="mt-auto pt-6 text-sm font-semibold">
              <span className="rounded-md border border-dashed border-amber-300/70 bg-amber-300/10 px-2 py-1 text-amber-200">
                {t("programs.fee")}
              </span>
            </p>
          </article>
        </div>

        <div id="enroll" className="relative mt-8 overflow-hidden rounded-3xl border-t-4 border-club-scarlet bg-club-brand-deep p-6 text-white sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-xl font-black sm:text-2xl">{t("steps.title")}</h3>
            <a href="#contact" className="club-btn hidden items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold sm:inline-flex">
              {t("programs.cta")}
              <ArrowIcon className="h-4 w-4" />
            </a>
          </div>
          <ol className="mt-6 grid md:grid-cols-4 md:gap-4">
            {STEPS.map((step) => (
              <li key={step} className="flex gap-4 md:flex-col md:gap-3">
                <div className="flex flex-col items-center gap-1 md:flex-row md:gap-3">
                  {step === 4 ? (
                    <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#06c755] text-white">
                      <LineIcon className="h-6 w-6" />
                      <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-club-gold text-[11px] font-black text-club-brand">
                        4
                      </span>
                    </span>
                  ) : (
                    <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-club-gold text-lg font-black text-club-brand italic ring-2 ring-club-gold-2/60 ring-offset-2 ring-offset-club-brand-deep">
                      {step}
                    </span>
                  )}
                  {step === 4 ? null : <span className="w-px flex-1 bg-white/20 md:h-px md:w-auto" />}
                </div>
                <div className={step === 4 ? "" : "pb-6 md:pb-0"}>
                  <p className="font-bold">{t(`steps.s${step}t`)}</p>
                  <p className="mt-1 text-sm leading-6 text-white/65">{t(`steps.s${step}b`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <a href="#contact" className="club-btn mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-bold sm:hidden">
            {t("programs.cta")}
          </a>
        </div>
      </div>
    </section>
  );
}

function CheckItem({ children, tone }: { children: React.ReactNode; tone: "emerald" | "gold" }) {
  return (
    <li className="flex gap-2.5">
      <CheckIcon className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "emerald" ? "text-emerald-600" : "text-club-gold"}`} />
      <span>{children}</span>
    </li>
  );
}

function CalendarIconLarge() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17.5h2" />
    </svg>
  );
}

function CampIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18M5 20l7-15 7 15M9 20l3-5 3 5" />
    </svg>
  );
}

export async function PortalNews() {
  const t = await getTranslations("portal");
  const locale = await getLocale();
  return (
    <section id="news" className="overflow-x-clip py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PortalEyebrow>{t("news.eyebrow")}</PortalEyebrow>
        <h2 className="mt-3 flex flex-wrap items-center gap-3 text-3xl font-black tracking-tight sm:text-4xl">
          <span>{t("news.title")}</span>
          <span className="club-sample rounded-full px-2.5 py-1 text-xs font-bold tracking-wide">{t("news.sample")}</span>
        </h2>
        <div className="no-scrollbar -mx-4 mt-10 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0">
          {NEWS.map((item) => (
            <article key={item.id} className="club-card flex w-[82%] shrink-0 snap-start flex-col overflow-hidden rounded-3xl border border-club-brand/10 bg-white md:w-auto">
              <PhotoSlot label={t("news.photo")} className="aspect-[16/9] rounded-none border-x-0 border-t-0" />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase ${NEWS_BADGE[item.category]}`}>
                    {t(`news.cat.${item.category}`)}
                  </span>
                  <time className="text-xs text-club-brand/55" dateTime={t(`news.items.${item.id}.date`)}>
                    {formatPortalDate(t(`news.items.${item.id}.date`), locale, siteConfig.timeZone)}
                  </time>
                </div>
                <h3 className="mt-3 text-base leading-snug font-bold">{t(`news.items.${item.id}.title`)}</h3>
                <p className="mt-2 text-sm leading-6 text-club-brand/65">{t(`news.items.${item.id}.body`)}</p>
                <a href="#news" className="mt-auto pt-4 text-sm font-bold underline decoration-club-scarlet decoration-[3px] underline-offset-4">
                  {t("news.readMore")} →
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function PortalCoaches() {
  const t = await getTranslations("portal");
  return (
    <section id="coaches" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PortalEyebrow>{t("coaches.eyebrow")}</PortalEyebrow>
        <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{t("coaches.title")}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-club-brand/70 sm:text-base">{t("coaches.lead")}</p>
        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
          {COACHES.map((role) => (
            <article key={role} className="club-card flex flex-col items-center rounded-3xl border border-club-brand/10 bg-club-cream p-4 text-center sm:p-5">
              <PhotoSlot label={t("coaches.photo")} className="aspect-square w-full max-w-[112px] rounded-full sm:max-w-[150px]" />
              <span className="mt-4 rounded-full bg-club-brand px-2.5 py-1 text-[11px] font-bold tracking-wider text-club-gold-2 uppercase">
                {t(`coaches.role.${role}`)}
              </span>
              <h3 className="mt-2 text-sm font-bold sm:text-base">{t("coaches.name")}</h3>
              <p className="mt-1 text-xs text-club-brand/55">{t("coaches.license")}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function PortalContact() {
  const t = await getTranslations("portal");
  return (
    <section id="contact" className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PortalEyebrow>{t("contact.eyebrow")}</PortalEyebrow>
        <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{t("contact.title")}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-club-brand/75 sm:text-base">{t("contact.welcome")}</p>
        <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_1.25fr]">
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-club-brand/10 bg-white p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-club-brand text-club-gold">
                  <PinLarge />
                </span>
                <div>
                  <p className="text-xs font-bold tracking-wide text-club-brand/50 uppercase">{t("contact.ground")}</p>
                  <p className="mt-1.5 font-semibold">
                    <span className="club-sample inline-block rounded-lg px-2 py-1">{t("contact.address")}</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-club-brand/10 bg-white p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-club-brand text-club-gold">
                  <MailIcon />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-wide text-club-brand/50 uppercase">{t("contact.email")}</p>
                  <p className="mt-1 font-semibold break-all underline decoration-club-scarlet decoration-2 underline-offset-4">
                    {t("contact.emailValue")}
                  </p>
                  <p className="mt-1 text-xs text-club-brand/55">{t("contact.hours")}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-club-brand/10 bg-white p-5">
              <p className="text-xs font-bold tracking-wide text-club-brand/50 uppercase">{t("contact.social")}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <SocialPlaceholder label="LINE" className="bg-[#06c755]" icon={<LineIcon className="h-7 w-7" />} />
                <SocialPlaceholder
                  label="Instagram"
                  className="bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]"
                  icon={<InstagramIcon className="h-7 w-7" />}
                />
                <SocialPlaceholder label="Facebook" className="bg-[#1877f2]" icon={<FacebookIcon className="h-7 w-7" />} />
              </div>
              <p className="mt-3 text-xs text-club-brand/55">{t("contact.socialNote")}</p>
            </div>
          </div>
          <div className="relative min-h-[320px] overflow-hidden rounded-3xl border-2 border-dashed border-club-brand/25 bg-[#e9e5da]">
            <MapArt />
            <div className="absolute inset-x-4 bottom-4 flex flex-col gap-3 rounded-2xl bg-white/95 p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold">{t("contact.map")}</p>
                <p className="text-xs text-club-brand/55">{t("contact.mapHint")}</p>
              </div>
              {siteConfig.links.mapUrl ? (
                <a
                  href={siteConfig.links.mapUrl}
                  className="inline-flex shrink-0 items-center justify-center rounded-full bg-club-brand px-4 py-2 text-xs font-semibold text-club-on-brand"
                >
                  {t("contact.openMap")}
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-club-brand px-4 py-2 text-xs font-semibold text-club-on-brand opacity-80"
                >
                  {t("contact.openMap")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialPlaceholder({
  label,
  className,
  icon,
}: {
  label: string;
  className: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-white ${className}`} title={label}>
      {icon}
      <span className="text-[11px] font-semibold">{label}</span>
    </div>
  );
}

function PinLarge() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  );
}

function MapArt() {
  return (
    <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 600 420" aria-hidden="true">
      <rect width="600" height="420" fill="#e9e5da" />
      <g stroke="#fff" strokeWidth="14" fill="none" strokeLinecap="round">
        <path d="M-10 120 L610 80" />
        <path d="M-10 300 L610 330" />
        <path d="M180 -10 L220 430" />
        <path d="M430 -10 L400 430" />
      </g>
      <g stroke="#fff" strokeWidth="6" fill="none">
        <path d="M-10 210 L610 205" />
        <path d="M90 -10 L110 430" />
        <path d="M520 -10 L530 430" />
      </g>
      <rect x="240" y="110" width="140" height="170" rx="10" fill="#cfe3b8" />
      <rect x="262" y="135" width="96" height="120" fill="none" stroke="#fff" strokeWidth="3" />
      <line x1="262" y1="195" x2="358" y2="195" stroke="#fff" strokeWidth="3" />
      <circle cx="310" cy="195" r="14" fill="none" stroke="#fff" strokeWidth="3" />
      <rect x="30" y="140" width="50" height="50" rx="4" fill="#ddd8cb" />
      <rect x="460" y="230" width="50" height="70" rx="4" fill="#ddd8cb" />
      <rect x="450" y="110" width="60" height="40" rx="4" fill="#ddd8cb" />
      <g transform="translate(310 175)">
        <path d="M0 0 C-14 -18 -22 -28 -22 -40 A22 22 0 0 1 22 -40 C22 -28 14 -18 0 0Z" fill="var(--club-brand)" />
        <circle cx="0" cy="-40" r="8" fill="var(--club-scarlet)" />
      </g>
    </svg>
  );
}

const FOOTER_LINKS = [
  { href: "#about", key: "about" },
  { href: "#teams", key: "teams" },
  { href: "/matches", key: "matches", route: true },
  { href: "#programs", key: "programs" },
  { href: "#news", key: "news" },
  { href: "#contact", key: "contact" },
] as const;

export async function PortalFooter({ signedIn, clubName }: { signedIn: boolean; clubName: string }) {
  const t = await getTranslations("portal");
  const accountLabel = signedIn ? t("nav.app") : t("nav.login");
  return (
    <footer className="relative overflow-hidden bg-club-brand-deep text-white">
      <div className="club-stars pointer-events-none absolute top-0 right-0 h-full w-1/3 opacity-[0.06]" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-28 sm:px-6 lg:pb-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <ClubCrest alt={t("crestAlt")} className="h-14 w-auto" />
              <div>
                <p className="club-wordmark text-xl">{siteConfig.wordmark}</p>
                <p className="text-xs text-white/60">{clubName}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-white/65">{t("footer.tagline")}</p>
            <p className="mt-4 flex max-w-md gap-2 text-xs leading-6 text-white/50">
              <ShieldIcon className="mt-1 h-3.5 w-3.5 shrink-0" />
              <span>{t("footer.privacy")}</span>
            </p>
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-club-gold uppercase">{t("footer.links")}</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-sm text-white/75 md:grid-cols-1">
              {FOOTER_LINKS.map((item) => (
                <li key={item.href}>
                  {"route" in item ? (
                    <Link href="/matches" className="hover:text-white">
                      {t(`nav.${item.key}`)}
                    </Link>
                  ) : (
                    <a href={item.href} className="hover:text-white">
                      {t(`nav.${item.key}`)}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-club-gold uppercase">{t("footer.parents")}</p>
            <Link
              href={portalAccountHref(signedIn)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-club-brand hover:bg-white/90"
            >
              <UserIcon className="h-4 w-4" />
              {accountLabel}
            </Link>
            <div className="mt-5 flex gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10" aria-label="LINE">
                <LineIcon className="h-5 w-5" />
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10" aria-label="Instagram">
                <InstagramIcon className="h-5 w-5" />
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10" aria-label="Facebook">
                <FacebookIcon className="h-5 w-5" />
              </span>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>{t("footer.rights", { club: clubName })}</p>
          <p>
            {t("footer.brandNote")} · {t("footer.powered")}
          </p>
        </div>
      </div>
    </footer>
  );
}
