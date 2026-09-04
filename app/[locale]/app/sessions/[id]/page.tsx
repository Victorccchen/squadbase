import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";
import { ParentNoteForm } from "@/components/sessions/parent-note-form";
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
  getSession,
  listOwnSessionRegistrations,
} from "@/lib/org/session-queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { formatClubDateTimeRange, isSessionOpenForSignup } from "@/lib/org/session-time";
import { creditsApplyToAgeBand, defaultNoticeDebit } from "@/lib/credits/debit-rules";

type ParentSessionDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    note?: string | string[];
  }>;
};

export default async function ParentSessionDetailPage({
  params,
  searchParams,
}: ParentSessionDetailPageProps) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    notFound();
  }

  const t = await getTranslations("sessions");
  const creditsT = await getTranslations("credits");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const query = await searchParams;
  const noteRaw = Array.isArray(query.note) ? (query.note[0] ?? "") : (query.note ?? "");
  const showNoteSaved = noteRaw === "1";
  const links = await listOwnGuardianLinks();
  const children = approvedChildrenFromLinks(links);
  const playerIds = [...new Set(children.map((child) => child.player.id))];
  const registrations = await listOwnSessionRegistrations(playerIds);

  const openOnThisSession = registrations.filter(
    (row) => row.session_id === session.id && row.status === "registered",
  );
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
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{creditsT("debitLabel")}</dt>
            <dd className="font-medium">
              {noticeDebit.noDebitLabel || !creditsApplyToAgeBand(teamBand)
                ? creditsT("noDebit")
                : creditsT("creditsCount", { count: noticeDebit.credits })}
            </dd>
          </div>
        </dl>

        {showNoteSaved ? (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          >
            {t("noteSaved")}
          </p>
        ) : null}

        {openOnThisSession.map((row) => (
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
            <p className="text-sm leading-6 text-emerald-800 dark:text-emerald-200">
              {t("confirmation")}
            </p>
            <ParentNoteForm
              registrationId={row.id}
              sessionId={session.id}
              initialNote={row.parent_note}
            />
          </section>
        ))}

        {openOnThisSession.length === 0 ? (
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {canSignup ? t("registerFromListHint") : t("closedSignup")}
          </p>
        ) : null}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
