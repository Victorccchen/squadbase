import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import {
  SessionDeletedBadge,
  SessionKindBadge,
  SessionPlayoffBadge,
  SessionStatusBadge,
} from "@/components/sessions/session-status-badge";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessRoster } from "@/lib/auth/roles";
import { getSession, listSessionRegistrations } from "@/lib/org/session-queries";
import { getMatchForStaff } from "@/lib/org/match-queries";
import { MatchSideBadge, MatchStatusBadge } from "@/components/matches/match-status-badge";
import { listActiveRosterForTeam } from "@/lib/credits/queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { publicOpponentLabel, isMatchKind } from "@/lib/org/match";
import { formatClubDateTimeRange } from "@/lib/org/session-time";
import { secondaryButtonClassName } from "@/lib/ui";

type CoachSessionPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * Coach view of one session: who is coming, with links to their assessments.
 * Read-only. Attendance and credits are staff work (Phase 1 PR-04).
 */
export default async function CoachSessionPage({ params }: CoachSessionPageProps) {
  const { roles } = await loadSignedInAccount();
  if (!canAccessRoster(roles)) {
    return <AccessDenied area="roster" />;
  }

  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    notFound();
  }

  const t = await getTranslations("credits");
  const sessionsT = await getTranslations("sessions");
  const matchesT = await getTranslations("matches");
  const org = await getTranslations("org");
  const rosterT = await getTranslations("roster");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const [registrations, roster, match] = await Promise.all([
    listSessionRegistrations(session.id),
    session.team_id ? listActiveRosterForTeam(session.team_id) : Promise.resolve([]),
    isMatchKind(session.kind)
      ? getMatchForStaff(session.id)
      : Promise.resolve(null),
  ]);

  const registered = registrations.filter((row) => row.status === "registered");
  const useRoster = isMatchKind(session.kind);
  const players = useRoster
    ? roster.map((row) => ({ player: row.player, jerseyNumber: row.membership.jersey_number }))
    : registered
        .filter((row) => row.player)
        .map((row) => ({
          player: row.player!,
          jerseyNumber:
            roster.find((item) => item.player.id === row.player_id)?.membership.jersey_number ?? null,
        }));


  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={session.title}
          description={`${session.team?.name ?? org("unknownTeam")} · ${formatClubDateTimeRange(session.starts_at, session.ends_at, locale)}`}
          actions={
            <Link href="/app/roster" className={secondaryButtonClassName}>
              {t("backToRoster")}
            </Link>
          }
        />
        <div className="flex flex-wrap gap-2">
          <SessionKindBadge kind={session.kind} label={sessionsT(`kinds.${session.kind}`)} />
          {session.is_playoff ? <SessionPlayoffBadge label={sessionsT("playoff")} /> : null}
          {session.deleted_at ? (
            <SessionDeletedBadge label={sessionsT("deleted")} />
          ) : (
            <SessionStatusBadge
              status={session.status}
              label={org(session.status === "active" ? "statusActive" : "statusInactive")}
            />
          )}
        </div>
        {match ? (
          <section className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {matchesT("title")}
            </h2>
            <p className="text-zinc-600 dark:text-zinc-300">{matchesT("coachReadOnly")}</p>
            <div className="flex flex-wrap gap-2">
              <MatchStatusBadge
                status={match.publication.public_status}
                label={matchesT(`statuses.${match.publication.public_status}`)}
              />
              <MatchSideBadge label={matchesT(`sides.${match.publication.side}`)} />
            </div>
            <p>
              {match.team?.name ?? org("unknownTeam")} {matchesT("versus")}{" "}
              {publicOpponentLabel(match.publication.opponent, matchesT("opponentTbd"))}
            </p>
            {match.publication.is_published ? (
              <Link href={`/matches/${session.id}`} className={secondaryButtonClassName}>
                {matchesT("viewPublic")}
              </Link>
            ) : null}
          </section>
        ) : null}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {rosterT("sessionPlayersTitle")}
          </h2>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {useRoster ? rosterT("sessionPlayersLeadMatch") : rosterT("sessionPlayersLeadTraining")}
          </p>
          {players.length === 0 ? (
            <p className="text-sm text-zinc-500">{sessionsT("emptyRoster")}</p>
          ) : (
            <ul className="grid gap-2">
              {players.map((row) => (
                <li
                  key={row.player.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="font-medium">
                    {row.jerseyNumber !== null ? `#${row.jerseyNumber} ` : ""}
                    {localizedPlayerName(row.player, locale)}
                  </span>
                  <Link
                    href={`/app/assessments/${row.player.id}`}
                    className="font-medium underline underline-offset-2"
                  >
                    {rosterT("openAssessment")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
