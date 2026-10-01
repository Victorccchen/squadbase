import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowIcon, ClockIcon, InfoIcon, PinIcon } from "@/components/portal/portal-icons";
import { PortalEyebrow } from "@/components/portal/portal-ui";
import { SESSION_KIND_BADGE_CLASS } from "@/lib/org/session-kind-colors";
import { publicOpponentLabel } from "@/lib/org/match";
import { formatPortalKickoff, portalResultMark, type PortalResultMark } from "@/lib/site/portal-matches";
import { siteConfig } from "@/lib/site/site-config";
import type { PublishedMatch, SessionKind } from "@/lib/supabase/database.types";

type PortalMatchesProps = {
  locale: string;
  upcoming: PublishedMatch[];
  recent: PublishedMatch[];
};

export async function PortalMatches({ locale, upcoming, recent }: PortalMatchesProps) {
  const t = await getTranslations("portal");

  return (
    <section id="matches" className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <PortalEyebrow>{t("matches.eyebrow")}</PortalEyebrow>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{t("matches.title")}</h2>
          </div>
          <Link
            href="/matches"
            className="hidden w-fit items-center gap-1.5 rounded-full border border-club-brand/20 bg-white px-4 py-2 text-sm font-semibold hover:border-club-brand/40 sm:inline-flex"
          >
            {t("matches.viewAll")}
            <ArrowIcon className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900 sm:text-sm">
          <InfoIcon className="mt-1 h-4 w-4 shrink-0" />
          <span>{t("matches.note")}</span>
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <MatchColumn
            title={t("matches.upcoming")}
            dotClass="bg-sky-500"
            emptyTitle={t("matches.upcomingEmptyTitle")}
            emptyBody={t("matches.upcomingEmptyBody")}
            matches={upcoming}
            locale={locale}
            mode="upcoming"
          />
          <MatchColumn
            title={t("matches.recent")}
            dotClass="bg-emerald-500"
            emptyTitle={t("matches.recentEmptyTitle")}
            emptyBody={t("matches.recentEmptyBody")}
            matches={recent}
            locale={locale}
            mode="recent"
          />
        </div>

        <Link
          href="/matches"
          className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full border border-club-brand/20 bg-white px-4 py-3 text-sm font-semibold sm:hidden"
        >
          {t("matches.viewAll")}
          <ArrowIcon className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function MatchColumn({
  title,
  dotClass,
  emptyTitle,
  emptyBody,
  matches,
  locale,
  mode,
}: {
  title: string;
  dotClass: string;
  emptyTitle: string;
  emptyBody: string;
  matches: PublishedMatch[];
  locale: string;
  mode: "upcoming" | "recent";
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-bold tracking-wide text-club-brand/60 uppercase">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
        {title}
      </h3>
      {matches.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-club-brand/20 bg-white/70 px-4 py-8 text-center">
          <p className="font-bold">{emptyTitle}</p>
          <p className="mt-1 text-sm leading-6 text-club-brand/70">{emptyBody}</p>
        </div>
      ) : (
        <ul className="mt-3 grid gap-3">
          {matches.map((match) => (
            <li key={match.id}>
              {mode === "upcoming" ? (
                <UpcomingCard match={match} locale={locale} />
              ) : (
                <RecentCard match={match} locale={locale} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function UpcomingCard({ match, locale }: { match: PublishedMatch; locale: string }) {
  const t = await getTranslations("portal");
  const kickoff = formatPortalKickoff(match.starts_at, locale, siteConfig.timeZone);
  const opponent = publicOpponentLabel(match.opponent, t("matches.opponentTbd"));

  return (
    <Link
      href={`/matches/${match.id}`}
      className="club-card flex gap-4 rounded-2xl border border-club-brand/10 bg-white p-4"
    >
      <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl border-b-4 border-club-scarlet bg-club-brand py-2 text-club-on-brand">
        <span className="text-[11px] font-semibold text-white/70">{kickoff?.month}</span>
        <span className="text-2xl leading-none font-black text-club-gold-2">{kickoff?.day}</span>
        <span className="mt-0.5 text-[11px] text-white/70">{kickoff?.weekday}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={match.kind} label={kindLabel(match.kind, t)} />
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-zinc-800 uppercase">
            {t(match.side === "home" ? "matches.home" : "matches.away")}
          </span>
          {match.is_playoff ? (
            <span className="rounded-full bg-club-gold/20 px-2.5 py-1 text-[11px] font-semibold text-club-brand">
              {t("matches.playoff")}
            </span>
          ) : null}
        </div>
        <p className="mt-2 leading-snug font-bold">
          {match.team_name} <span className="font-medium text-club-brand/45">{t("matches.versus")}</span> {opponent}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-club-brand/60">
          {kickoff ? (
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="h-3.5 w-3.5" />
              {kickoff.time}
            </span>
          ) : null}
          {match.location ? (
            <span className="inline-flex items-center gap-1">
              <PinIcon className="h-3.5 w-3.5" />
              {match.location}
            </span>
          ) : null}
        </p>
      </div>
    </Link>
  );
}

async function RecentCard({ match, locale }: { match: PublishedMatch; locale: string }) {
  const t = await getTranslations("portal");
  const kickoff = formatPortalKickoff(match.starts_at, locale, siteConfig.timeZone);
  const opponent = publicOpponentLabel(match.opponent, t("matches.opponentTbd"));
  const mark = portalResultMark(match.club_score, match.opponent_score);

  return (
    <Link
      href={`/matches/${match.id}`}
      className="club-card flex items-center gap-4 rounded-2xl border border-club-brand/10 bg-white p-4"
    >
      <ResultMark mark={mark} label={mark ? t(`matches.${mark}`) : "–"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={match.kind} label={kindLabel(match.kind, t)} />
          {kickoff ? <span className="text-xs text-club-brand/55">{kickoff.full}</span> : null}
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm">
          <span className="truncate font-bold">{match.team_name}</span>
          <span className="text-lg font-black tabular-nums">{scoreText(match.club_score)}</span>
          <span className="truncate text-club-brand/65">{opponent}</span>
          <span className="text-lg font-black tabular-nums text-club-brand/45">{scoreText(match.opponent_score)}</span>
        </div>
      </div>
    </Link>
  );
}

function scoreText(score: number | null): string {
  return score === null ? "–" : String(score);
}

function ResultMark({ mark, label }: { mark: PortalResultMark | null; label: string }) {
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-black ${resultClass(mark)}`}
    >
      {label}
    </span>
  );
}

function resultClass(mark: PortalResultMark | null): string {
  switch (mark) {
    case "W":
      return "bg-emerald-500 text-white";
    case "D":
      return "bg-zinc-400 text-white";
    case "L":
      return "bg-rose-500 text-white";
    case null:
      return "bg-zinc-200 text-club-brand";
    default: {
      const neverMark: never = mark;
      return neverMark;
    }
  }
}

function KindBadge({ kind, label }: { kind: SessionKind; label: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase ${SESSION_KIND_BADGE_CLASS[kind]}`}>
      {label}
    </span>
  );
}

function kindLabel(
  kind: SessionKind,
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
