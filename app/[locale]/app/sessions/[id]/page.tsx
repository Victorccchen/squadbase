import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";
import { RegisterForm } from "@/components/sessions/register-form";
import { CancelRegistrationForm } from "@/components/sessions/cancel-registration-form";
import { ChangeSessionForm } from "@/components/sessions/change-session-form";
import { QuestionForm } from "@/components/sessions/question-form";
import { MessageThread } from "@/components/sessions/message-thread";
import {
  RegistrationStatusBadge,
  SessionDeletedBadge,
  SessionKindBadge,
  SessionPlayoffBadge,
  SessionStatusBadge,
} from "@/components/sessions/session-status-badge";
import { listOwnGuardianLinks } from "@/lib/org/queries";
import {
  approvedChildrenFromLinks,
  eligibleChildrenForSession,
  getSession,
  listOpenSessionsForParent,
  listOwnSessionRegistrations,
  openSessionsForChildTeam,
} from "@/lib/org/session-queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { formatClubDateTimeRange, isSessionOpenForSignup } from "@/lib/org/session-time";

type ParentSessionDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ParentSessionDetailPage({
  params,
}: ParentSessionDetailPageProps) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    notFound();
  }

  const t = await getTranslations("sessions");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const links = await listOwnGuardianLinks();
  const children = approvedChildrenFromLinks(links);
  const teamIds = [...new Set(children.map((child) => child.teamId))];
  const playerIds = children.map((child) => child.player.id);
  const [openSessions, registrations] = await Promise.all([
    listOpenSessionsForParent(teamIds),
    listOwnSessionRegistrations(playerIds),
  ]);

  const onThisSession = registrations.filter((row) => row.session_id === session.id);
  const eligible = eligibleChildrenForSession(children, session, registrations);
  const canSignup = isSessionOpenForSignup(session);
  const belongsToFamily = children.some((child) => child.teamId === session.team_id);
  const hasOwnRegistration = onThisSession.length > 0;

  if (!belongsToFamily && !hasOwnRegistration) {
    notFound();
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={session.title}
          description={`${session.team?.name ?? org("unknownTeam")} · ${formatClubDateTimeRange(session.starts_at, session.ends_at, locale)}`}
          actions={
            <Link
              href="/app/sessions"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {t("backToList")}
            </Link>
          }
        />
        <dl className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{t("kind")}</dt>
            <dd className="flex flex-wrap justify-end gap-2">
              <SessionKindBadge kind={session.kind} label={t(`kinds.${session.kind}`)} />
              {session.is_playoff ? <SessionPlayoffBadge label={t("playoff")} /> : null}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("status")}</dt>
            <dd>
              {session.deleted_at ? (
                <SessionDeletedBadge label={t("deleted")} />
              ) : (
                <SessionStatusBadge
                  status={session.status}
                  label={org(session.status === "active" ? "statusActive" : "statusInactive")}
                />
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{t("location")}</dt>
            <dd className="font-medium">{session.location || "—"}</dd>
          </div>
          {session.notes ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{t("notes")}</dt>
              <dd className="text-right">{session.notes}</dd>
            </div>
          ) : null}
        </dl>

        {onThisSession.map((row) => (
          <section
            key={row.id}
            className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-center gap-2">
              <RegistrationStatusBadge status={row.status} label={t(`statuses.${row.status}`)} />
              <span className="font-medium">
                {row.player ? localizedPlayerName(row.player, locale) : t("unknownPlayer")}
              </span>
            </div>
            {row.status === "registered" ? (
              <p className="text-sm leading-6 text-emerald-800 dark:text-emerald-200">
                {t("confirmation")}
              </p>
            ) : null}
            {row.parent_note ? (
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {t("parentNote")}: {row.parent_note}
              </p>
            ) : null}
            {row.status === "registered" ? (
              <>
                <CancelRegistrationForm registrationId={row.id} sessionId={session.id} />
                <ChangeSessionForm
                  registrationId={row.id}
                  options={openSessionsForChildTeam(openSessions, session.team_id, session.id)}
                  locale={locale}
                />
              </>
            ) : null}
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {t("qaTitle")}
              </h2>
              <MessageThread messages={row.messages} locale={locale} />
              <QuestionForm
                registrationId={row.id}
                sessionId={session.id}
                authorRole="parent"
              />
            </div>
          </section>
        ))}

        {canSignup ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {t("register")}
            </h2>
            <RegisterForm
              sessionId={session.id}
              childrenOptions={eligible}
              locale={locale}
            />
          </section>
        ) : (
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {t("closedSignup")}
          </p>
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}