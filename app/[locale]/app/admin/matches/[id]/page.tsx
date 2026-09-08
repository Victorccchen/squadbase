import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { AdminSessionRegistrations } from "@/components/admin/admin-session-registrations";
import { MatchForm } from "@/components/admin/match-form";
import { MatchRosterForm } from "@/components/admin/match-roster-form";
import { MatchResultForm } from "@/components/admin/match-result-form";
import { MatchPublishForm } from "@/components/admin/match-publish-form";
import { MatchCancelForm, MatchRestoreForm } from "@/components/admin/match-cancel-form";
import { SessionSoftDeleteForm } from "@/components/admin/session-soft-delete-form";
import {
  SessionDeletedBadge,
  SessionKindBadge,
  SessionPlayoffBadge,
} from "@/components/sessions/session-status-badge";
import { MatchSideBadge, MatchStatusBadge } from "@/components/matches/match-status-badge";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { suggestedNoticeAudience, suggestedNoticeTemplate } from "@/lib/credits/notice-templates";
import { listTeams } from "@/lib/org/queries";
import { getMatchForStaff, listMatchRosterForStaff } from "@/lib/org/match-queries";
import { listSessionRegistrations } from "@/lib/org/session-queries";
import {
  cancelMatch,
  restoreMatch,
  setMatchPublished,
  setMatchResult,
  setMatchRoster,
  softDeleteMatch,
  updateMatch,
} from "@/lib/org/match-actions";
import { listActiveRosterForTeam } from "@/lib/credits/queries";
import { formatMatchScore } from "@/lib/org/match";
import { formatClubDateTimeRange } from "@/lib/org/session-time";
import { ReportExportButtons } from "@/components/admin/report-export-buttons";
import { secondaryButtonClassName } from "@/lib/ui";

type AdminMatchDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminMatchDetailPage({ params }: AdminMatchDetailPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const { id } = await params;
  const match = await getMatchForStaff(id);
  if (!match) {
    notFound();
  }

  const t = await getTranslations("admin");
  const matchesT = await getTranslations("matches");
  const noticesT = await getTranslations("notices");
  const reportsT = await getTranslations("reports");
  const sessionsT = await getTranslations("sessions");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const [teams, roster, teamRoster, registrations] = await Promise.all([
    listTeams({ kind: "competition_team" }),
    listMatchRosterForStaff(match.id),
    match.team_id ? listActiveRosterForTeam(match.team_id) : Promise.resolve([]),
    listSessionRegistrations(match.id),
  ]);
  const score = formatMatchScore(match.publication.club_score, match.publication.opponent_score);
  const cancelled = match.publication.public_status === "cancelled";
  const isDeleted = Boolean(match.deleted_at);
  const updateAction = updateMatch.bind(null, match.id);
  const registeredIds = registrations
    .filter((row) => row.status === "registered")
    .map((row) => row.player_id);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={match.title}
          description={`${match.team?.name ?? org("unknownTeam")} · ${formatClubDateTimeRange(match.starts_at, match.ends_at, locale)}`}
          actions={
            <span className="flex flex-wrap gap-2">
              {isDeleted ? null : (
                <Link href={`/matches/${match.id}`} className={secondaryButtonClassName}>
                  {matchesT("viewPublic")}
                </Link>
              )}
              <Link href={`/app/admin/sessions/${match.id}`} className={secondaryButtonClassName}>
                {matchesT("openSession")}
              </Link>
              <Link
                href={`/app/admin/notices?session=${match.id}&template=${suggestedNoticeTemplate(match.kind, match.publication.public_status)}&audience=${suggestedNoticeAudience(match.team?.kind)}`}
                className={secondaryButtonClassName}
              >
                {noticesT("generateCta")}
              </Link>
            </span>
          }
        />
        <div className="flex flex-wrap gap-2">
          <SessionKindBadge kind={match.kind} label={sessionsT(`kinds.${match.kind}`)} />
          {match.is_playoff ? <SessionPlayoffBadge label={sessionsT("playoff")} /> : null}
          {isDeleted ? (
            <SessionDeletedBadge label={matchesT("matchDeleted")} />
          ) : (
            <MatchStatusBadge
              status={match.publication.public_status}
              label={matchesT(`statuses.${match.publication.public_status}`)}
            />
          )}
          <MatchSideBadge label={matchesT(`sides.${match.publication.side}`)} />
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            {match.publication.is_published ? matchesT("published") : matchesT("unpublished")}
          </span>
        </div>
        <p className="text-sm text-zinc-500">
          {t("rosterCount", { count: registeredIds.length })}
          {" · "}
          {matchesT("rosterCount", { count: roster.length })}
        </p>
        {score ? (
          <p className="text-lg font-semibold">
            {matchesT("score")}: {score}
          </p>
        ) : null}
        {isDeleted ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            {matchesT("matchDeletedBanner")}
          </p>
        ) : cancelled ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            {matchesT("cancelledBanner")}
          </p>
        ) : null}
        {isDeleted ? null : (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {cancelled ? (
              <MatchRestoreForm action={restoreMatch.bind(null, match.id)} />
            ) : (
              <>
                <MatchPublishForm
                  action={setMatchPublished.bind(null, match.id)}
                  isPublished={match.publication.is_published}
                />
                <MatchCancelForm
                  action={cancelMatch.bind(null, match.id)}
                  confirmMessage={matchesT("cancelConfirm", { title: match.title })}
                />
              </>
            )}
            <SessionSoftDeleteForm
              action={softDeleteMatch.bind(null, match.id)}
              confirmMessage={matchesT("softDeleteMatchConfirm", { title: match.title })}
              submitLabel={matchesT("softDeleteMatch")}
            />
          </div>
        )}
        {isDeleted ? null : (
          <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {matchesT("editTitle")}
            </h2>
            <MatchForm
              action={updateAction}
              teams={teams}
              session={match}
              publication={match.publication}
              submitLabel={t("save")}
            />
          </section>
        )}
        {isDeleted || cancelled ? null : (
          <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {matchesT("resultTitle")}
            </h2>
            <MatchResultForm
              action={setMatchResult.bind(null, match.id)}
              clubScore={match.publication.club_score}
              opponentScore={match.publication.opponent_score}
              resultNote={match.publication.result_note}
            />
          </section>
        )}
        <AdminSessionRegistrations
          registrations={registrations}
          sessionId={match.id}
          locale={locale}
          variant="match"
        />
        <section className="flex flex-col gap-3">
          <ReportExportButtons
            reportType="registrations"
            sessionId={match.id}
            label={reportsT("shortcutRegistrations")}
          />
          <ReportExportButtons
            reportType="match_roster"
            sessionId={match.id}
            label={reportsT("shortcutRoster")}
          />
        </section>
        {isDeleted ? null : (
          <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {matchesT("staffRosterTitle")}
            </h2>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {matchesT("staffRosterHint")}
            </p>
            {teamRoster.length === 0 ? (
              <EmptyState title={matchesT("rosterEmptyTitle")} body={matchesT("rosterEmptyBody")} />
            ) : (
              <MatchRosterForm
                action={setMatchRoster.bind(null, match.id)}
                options={teamRoster.map((row) => ({
                  player: row.player,
                  jerseyNumber: row.membership.jersey_number,
                }))}
                selectedIds={roster.map((row) => row.player_id)}
                registeredIds={registeredIds}
                locale={locale}
              />
            )}
          </section>
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
