import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { AddToCalendar } from "@/components/calendar/add-to-calendar";
import { PageHeader } from "@/components/page-header";
import { LeaveRequestForm } from "@/components/credits/leave-request-form";
import { ParentNoteForm } from "@/components/sessions/parent-note-form";
import {
  RegistrationStatusBadge,
  SessionDeletedBadge,
  SessionKindBadge,
  SessionPlayoffBadge,
  SessionStatusBadge,
} from "@/components/sessions/session-status-badge";
import { calendarEventFromPublicFields } from "@/lib/org/calendar-export";
import { publicOpponentLabel } from "@/lib/org/match";
import { getPublishedMatch } from "@/lib/org/match-queries";
import { isTrainingSessionKind } from "@/lib/org/parent-series";
import { listOwnGuardianLinks } from "@/lib/org/queries";
import {
  approvedChildrenFromLinks,
  getSession,
  listOwnSessionRegistrations,
} from "@/lib/org/session-queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import {
  formatParentVisibleDateTimeRange,
  isSessionOpenForSignup,
} from "@/lib/org/session-time";
import { listLeaveRequestsForRegistrations } from "@/lib/credits/queries";
import { creditsApplyToAgeBand, defaultNoticeDebit } from "@/lib/credits/debit-rules";

type ParentCompetitionDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    note?: string | string[];
  }>;
};

export default async function ParentCompetitionDetailPage({
  params,
  searchParams,
}: ParentCompetitionDetailPageProps) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    notFound();
  }

  const locale = await getLocale();
  if (isTrainingSessionKind(session.kind)) {
    redirect({ href: `/app/sessions/${session.id}`, locale });
  }

  const t = await getTranslations("competitions");
  const sessionsT = await getTranslations("sessions");
  const creditsT = await getTranslations("credits");
  const matchesT = await getTranslations("matches");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const query = await searchParams;
  const noteRaw = Array.isArray(query.note) ? (query.note[0] ?? "") : (query.note ?? "");
  const showNoteSaved = noteRaw === "1";
  const [links, published] = await Promise.all([
    listOwnGuardianLinks(),
    getPublishedMatch(session.id),
  ]);
  const children = approvedChildrenFromLinks(links, "competition_team");
  const playerIds = [...new Set(children.map((child) => child.player.id))];
  const registrations = await listOwnSessionRegistrations(playerIds);

  const openOnThisSession = registrations.filter(
    (row) => row.session_id === session.id && row.status === "registered",
  );
  const leaveRequests = await listLeaveRequestsForRegistrations(
    openOnThisSession.map((row) => row.id),
  );
  const leaveByRegistration = new Map<string, (typeof leaveRequests)[number]>();
  for (const row of leaveRequests) {
    if (!leaveByRegistration.has(row.registration_id)) {
      leaveByRegistration.set(row.registration_id, row);
    }
  }
  const canSignup = isSessionOpenForSignup(session);
  const belongsToFamily = children.some((child) => child.teamId === session.team_id);
  const hasOwnRegistration = openOnThisSession.length > 0;
  const teamBand = session.team?.age_band ?? "U8";
  const noticeDebit = defaultNoticeDebit(
    session.kind,
    teamBand,
    session.no_debit,
    session.debit_override_n,
  );
  const opponent = published?.opponent ?? null;
  const event = calendarEventFromPublicFields(
    {
      id: session.id,
      title: session.title,
      starts_at: session.starts_at,
      ends_at: session.ends_at,
      location: session.location,
      kind: session.kind,
      opponent,
    },
    { kindLabel: sessionsT(`kinds.${session.kind}`), opponentTbd: matchesT("opponentTbd") },
  );

  if (!belongsToFamily && !hasOwnRegistration) {
    notFound();
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={session.title}
          description={`${session.team?.name ?? org("unknownTeam")} · ${formatParentVisibleDateTimeRange(session.starts_at, session.ends_at, locale)}`}
          actions={
            <Link
              href="/app/competitions"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {t("backToList")}
            </Link>
          }
        />
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
              {session.deleted_at ? (
                <SessionDeletedBadge label={sessionsT("deleted")} />
              ) : (
                <SessionStatusBadge
                  status={session.status}
                  label={org(session.status === "active" ? "statusActive" : "statusInactive")}
                />
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{matchesT("opponent")}</dt>
            <dd className="font-medium">
              {publicOpponentLabel(opponent, matchesT("opponentTbd"))}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{matchesT("kickoff")}</dt>
            <dd className="font-medium">
              {formatParentVisibleDateTimeRange(session.starts_at, session.ends_at, locale)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{sessionsT("location")}</dt>
            <dd className="font-medium">{session.location || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{creditsT("debitLabel")}</dt>
            <dd className="font-medium">
              {noticeDebit.noDebitLabel || !creditsApplyToAgeBand(teamBand)
                ? creditsT("noDebit")
                : creditsT("creditsCount", { count: noticeDebit.credits })}
            </dd>
          </div>
        </dl>
        <AddToCalendar event={event} />

        {showNoteSaved ? (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          >
            {sessionsT("noteSaved")}
          </p>
        ) : null}

        {openOnThisSession.map((row) => (
          <section
            key={row.id}
            className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
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
            <p className="text-sm leading-6 text-emerald-800 dark:text-emerald-200">
              {sessionsT("confirmation")}
            </p>
            <ParentNoteForm
              registrationId={row.id}
              sessionId={session.id}
              initialNote={row.parent_note}
              returnTo="competition"
            />
            {(() => {
              const leave = leaveByRegistration.get(row.id);
              if (leave?.status === "pending") {
                return <p className="text-sm text-zinc-500">{creditsT("leavePending")}</p>;
              }
              if (leave?.status === "approved") {
                return (
                  <p className="text-sm text-emerald-800 dark:text-emerald-200">
                    {creditsT("leaveApproved")}
                  </p>
                );
              }
              return (
                <LeaveRequestForm
                  registrationId={row.id}
                  sessionId={session.id}
                  returnTo="competition"
                />
              );
            })()}
          </section>
        ))}

        {openOnThisSession.length === 0 ? (
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {canSignup ? t("registerFromListHint") : sessionsT("closedSignup")}
          </p>
        ) : null}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
