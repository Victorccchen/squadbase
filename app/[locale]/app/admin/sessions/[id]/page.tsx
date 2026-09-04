import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SessionStatusForm } from "@/components/admin/session-status-form";
import { SessionSoftDeleteForm } from "@/components/admin/session-soft-delete-form";
import { QuestionForm } from "@/components/sessions/question-form";
import { MessageThread } from "@/components/sessions/message-thread";
import {
  RegistrationStatusBadge,
  SessionDeletedBadge,
  SessionKindBadge,
  SessionPlayoffBadge,
  SessionStatusBadge,
} from "@/components/sessions/session-status-badge";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { getSession, listSessionRegistrations } from "@/lib/org/session-queries";
import { setSessionStatus, softDeleteSession, softDeleteSessionSeries } from "@/lib/org/session-actions";
import { localizedPlayerName, playerNameList } from "@/lib/org/display-name";
import { formatClubDateTime, formatClubDateTimeRange } from "@/lib/org/session-time";
import { secondaryButtonClassName } from "@/lib/ui";
import { AttendancePanel } from "@/components/credits/attendance-panel";
import { DebitOverrideForm } from "@/components/credits/debit-override-form";
import { LeaveReviewForm } from "@/components/credits/leave-review-form";
import { NoticeCopyPanel } from "@/components/credits/notice-copy-panel";
import {
  listActiveRosterForTeam,
  listAttendanceForSession,
  listBalancesForPlayers,
  listLeaveRequestsForSession,
  publicAppOrigin,
} from "@/lib/credits/queries";
import { creditsApplyToAgeBand, defaultNoticeDebit } from "@/lib/credits/debit-rules";
import { sessionSignupUrl } from "@/lib/credits/notice";

type SessionDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminSessionDetailPage({ params }: SessionDetailPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    notFound();
  }

  const t = await getTranslations("admin");
  const sessionsT = await getTranslations("sessions");
  const creditsT = await getTranslations("credits");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const [registrations, attendance, roster, leaveRequests] = await Promise.all([
    listSessionRegistrations(session.id),
    listAttendanceForSession(session.id),
    session.team_id ? listActiveRosterForTeam(session.team_id) : Promise.resolve([]),
    listLeaveRequestsForSession(session.id),
  ]);
  const open = registrations.filter((row) => row.status === "registered");
  const history = registrations.filter((row) => row.status !== "registered");
  const isDeleted = Boolean(session.deleted_at);
  const teamBand = session.team?.age_band ?? "U8";
  const noDebitLabel = !creditsApplyToAgeBand(teamBand) || session.no_debit;
  const noticeDebit = defaultNoticeDebit(
    session.kind,
    teamBand,
    session.no_debit,
    session.debit_override_n,
  );
  const origin = publicAppOrigin();
  const signupUrl = origin
    ? sessionSignupUrl(origin, "zh-Hant", session.id)
    : `/zh-Hant/app/sessions/${session.id}`;
  const useRoster = session.kind === "cup" || session.kind === "league";
  const attendancePlayers = useRoster
    ? roster.map((row) => ({ player: row.player, jerseyNumber: row.membership.jersey_number }))
    : open
        .filter((row) => row.player)
        .map((row) => ({
          player: row.player!,
          jerseyNumber:
            roster.find((item) => item.player.id === row.player_id)?.membership.jersey_number ?? null,
        }));
  const balances = await listBalancesForPlayers(attendancePlayers.map((row) => row.player.id));
  const balanceByPlayer = new Map(balances.map((row) => [row.player_id, row.credits_available]));
  const attendanceByPlayer = new Map(attendance.map((row) => [row.player_id, row]));
  const pendingLeave = leaveRequests.filter((row) => row.status === "pending");

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={session.title}
          description={`${session.team?.name ?? org("unknownTeam")} · ${formatClubDateTimeRange(session.starts_at, session.ends_at, locale)}`}
          actions={
            <span className="flex flex-wrap gap-2">
              <Link href={`/app/admin/sessions/${session.id}/edit`} className={secondaryButtonClassName}>
                {t("edit")}
              </Link>
            </span>
          }
        />
        {isDeleted ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            {t("sessionDeletedBanner")}
          </p>
        ) : null}
        <dl className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{sessionsT("kind")}</dt>
            <dd className="flex flex-wrap justify-end gap-2">
              <SessionKindBadge kind={session.kind} label={sessionsT(`kinds.${session.kind}`)} />
              {session.is_playoff ? <SessionPlayoffBadge label={sessionsT("playoff")} /> : null}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("status")}</dt>
            <dd>
              {isDeleted ? (
                <SessionDeletedBadge label={t("sessionDeleted")} />
              ) : (
                <SessionStatusBadge
                  status={session.status}
                  label={org(session.status === "active" ? "statusActive" : "statusInactive")}
                />
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{sessionsT("location")}</dt>
            <dd className="font-medium">{session.location || "—"}</dd>
          </div>
          {session.notes ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{sessionsT("notes")}</dt>
              <dd className="text-right">{session.notes}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{t("rosterTitle")}</dt>
            <dd className="font-medium">{t("rosterCount", { count: open.length })}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{creditsT("debitLabel")}</dt>
            <dd className="font-medium">
              {noticeDebit.noDebitLabel
                ? creditsT("noDebit")
                : creditsT("creditsCount", { count: noticeDebit.credits })}
            </dd>
          </div>
        </dl>
        {isDeleted ? null : (
          <NoticeCopyPanel
            fields={{
              title: session.title,
              timeRange: formatClubDateTimeRange(session.starts_at, session.ends_at, locale),
              location: session.location || "—",
              team: session.team?.name ?? org("unknownTeam"),
              debitLabel: noticeDebit.noDebitLabel
                ? creditsT("noDebit")
                : String(noticeDebit.credits),
              signupUrl,
              deadline: formatClubDateTime(session.starts_at, locale),
              registeredCount: open.length,
            }}
          />
        )}
        {isDeleted ? null : (
          <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {creditsT("debitOverrideTitle")}
            </h2>
            <DebitOverrideForm
              sessionId={session.id}
              noDebit={session.no_debit}
              debitOverrideN={session.debit_override_n}
            />
          </section>
        )}
        {isDeleted ? null : (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {creditsT("attendanceTitle")}
            </h2>
            <AttendancePanel
              sessionId={session.id}
              next="admin"
              locale={locale}
              showCredits
              candidates={attendancePlayers.map((row) => {
                const marked = attendanceByPlayer.get(row.player.id);
                return {
                  player: row.player,
                  jerseyNumber: row.jerseyNumber,
                  creditsAvailable: balanceByPlayer.get(row.player.id) ?? 0,
                  attendanceStatus: marked?.status ?? null,
                  creditsDebited: marked?.credits_debited ?? 0,
                  noDebitLabel,
                };
              })}
            />
          </section>
        )}
        {pendingLeave.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {creditsT("leaveQueueTitle")}
            </h2>
            <ul className="grid gap-3">
              {pendingLeave.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <p className="text-sm">
                    {creditsT("leavePending")}
                    {row.parent_note ? ` · ${row.parent_note}` : ""}
                  </p>
                  <LeaveReviewForm requestId={row.id} sessionId={session.id} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {isDeleted ? null : (
          <SessionStatusForm
            status={session.status}
            action={setSessionStatus.bind(null, session.id)}
          />
        )}
        {isDeleted ? null : (
          <div className="flex flex-col gap-3">
            <SessionSoftDeleteForm
              action={softDeleteSession.bind(null, session.id)}
              confirmMessage={t("softDeleteSessionConfirm", { title: session.title })}
              submitLabel={t("softDeleteSession")}
            />
            {session.series_id ? (
              <SessionSoftDeleteForm
                action={softDeleteSessionSeries.bind(null, session.series_id, session.id)}
                confirmMessage={t("softDeleteSeriesConfirm", { title: session.title })}
                submitLabel={t("softDeleteSeries")}
              />
            ) : null}
          </div>
        )}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("rosterTitle")}
          </h2>
          {open.length === 0 ? (
            <EmptyState title={t("rosterEmptyTitle")} body={t("rosterEmptyBody")} />
          ) : (
            <ul className="grid gap-3">
              {open.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <RegistrationStatusBadge
                      status={row.status}
                      label={sessionsT(`statuses.${row.status}`)}
                    />
                    <span className="font-medium">
                      {row.player ? localizedPlayerName(row.player, locale) : sessionsT("unknownPlayer")}
                    </span>
                  </div>
                  {row.player ? (
                    <p className="text-sm text-zinc-500">{playerNameList(row.player)}</p>
                  ) : null}
                  {row.parent_note ? (
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {sessionsT("parentNote")}: {row.parent_note}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {sessionsT("qaTitle")}
                    </h3>
                    <MessageThread messages={row.messages} locale={locale} />
                    <QuestionForm
                      registrationId={row.id}
                      sessionId={session.id}
                      authorRole="admin"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {history.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {t("registrationHistoryTitle")}
            </h2>
            <ul className="grid gap-3">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <RegistrationStatusBadge
                      status={row.status}
                      label={sessionsT(`statuses.${row.status}`)}
                    />
                    <span className="font-medium">
                      {row.player ? localizedPlayerName(row.player, locale) : sessionsT("unknownPlayer")}
                    </span>
                  </div>
                  <MessageThread messages={row.messages} locale={locale} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
