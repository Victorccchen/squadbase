import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";
import { AvailableSessionCard } from "@/components/sessions/available-session-card";
import { SeriesRsvpForm } from "@/components/sessions/series-rsvp-form";
import { listOwnGuardianLinks } from "@/lib/org/queries";
import {
  approvedChildrenFromLinks,
  childrenOnSessionTeam,
  listOpenSessionsForParentSeries,
  listOwnSessionRegistrations,
  openRegistrationForPlayer,
} from "@/lib/org/session-queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { parseUuid } from "@/lib/org/parse";
import { secondaryButtonClassName } from "@/lib/ui";

type TrainingSeriesPageProps = {
  params: Promise<{ seriesId: string }>;
};

export default async function TrainingSeriesPage({ params }: TrainingSeriesPageProps) {
  const { seriesId } = await params;
  if (!parseUuid(seriesId)) {
    notFound();
  }

  const t = await getTranslations("competitions");
  const sessionsT = await getTranslations("sessions");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const links = await listOwnGuardianLinks();
  const children = approvedChildrenFromLinks(links, "age_squad");
  const teamIds = [...new Set(children.map((child) => child.teamId))];
  const playerIds = [...new Set(children.map((child) => child.player.id))];
  const [sessions, registrations] = await Promise.all([
    listOpenSessionsForParentSeries(seriesId, teamIds),
    listOwnSessionRegistrations(playerIds),
  ]);
  const first = sessions[0];
  if (!first) {
    notFound();
  }

  const teamChildren = childrenOnSessionTeam(children, first.team_id);

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={first.title}
          description={`${first.team?.name ?? org("unknownTeam")} · ${t("occurrenceCount", { count: sessions.length })}`}
          actions={
            <Link href="/app/sessions" className={secondaryButtonClassName}>
              {sessionsT("backToList")}
            </Link>
          }
        />
        <SeriesRsvpForm
          seriesId={seriesId}
          locale={locale}
          childrenOnTeam={teamChildren.map((child) => ({
            playerId: child.player.id,
            playerName: localizedPlayerName(child.player, locale),
          }))}
        />
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("occurrencesTitle")}
          </h2>
          <ul className="grid gap-3">
            {sessions.map((session) => (
              <AvailableSessionCard
                key={session.id}
                sessionId={session.id}
                title={session.title}
                teamName={session.team?.name ?? org("unknownTeam")}
                location={session.location}
                startsAt={session.starts_at}
                endsAt={session.ends_at}
                kind={session.kind}
                isPlayoff={session.is_playoff}
                locale={locale}
                detailHref={`/app/sessions/${session.id}`}
                returnTo="training-series"
                seriesId={seriesId}
                childrenOnTeam={teamChildren.map((child) => ({
                  playerId: child.player.id,
                  playerName: localizedPlayerName(child.player, locale),
                  registrationId:
                    openRegistrationForPlayer(registrations, session.id, child.player.id)?.id ??
                    null,
                }))}
              />
            ))}
          </ul>
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
