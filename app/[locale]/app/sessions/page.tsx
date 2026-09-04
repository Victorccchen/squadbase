import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  RegistrationStatusBadge,
  SessionKindBadge,
  SessionPlayoffBadge,
  SessionStatusBadge,
} from "@/components/sessions/session-status-badge";
import { listOwnGuardianLinks } from "@/lib/org/queries";
import {
  approvedChildrenFromLinks,
  listOpenSessionsForParent,
  listOwnSessionRegistrations,
} from "@/lib/org/session-queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { formatClubDateTimeRange } from "@/lib/org/session-time";

export default async function ParentSessionsPage() {
  const t = await getTranslations("sessions");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const links = await listOwnGuardianLinks();
  const children = approvedChildrenFromLinks(links);
  const teamIds = [...new Set(children.map((child) => child.teamId))];
  const playerIds = children.map((child) => child.player.id);
  const [sessions, registrations] = await Promise.all([
    listOpenSessionsForParent(teamIds),
    listOwnSessionRegistrations(playerIds),
  ]);
  const openRegistrations = registrations.filter((row) => row.status === "registered");

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-12">
        <PageHeader title={t("title")} description={t("lead")} />

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("upcomingTitle")}
          </h2>
          {children.length === 0 ? (
            <EmptyState title={t("emptyUpcomingTitle")} body={t("needApprovedChild")} />
          ) : sessions.length === 0 ? (
            <EmptyState title={t("emptyUpcomingTitle")} body={t("emptyUpcomingBody")} />
          ) : (
            <ul className="grid gap-3">
              {sessions.map((session) => (
                <li key={session.id}>
                  <Link
                    href={`/app/sessions/${session.id}`}
                    className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{session.title}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <SessionKindBadge
                          kind={session.kind}
                          label={t(`kinds.${session.kind}`)}
                        />
                        {session.is_playoff ? <SessionPlayoffBadge label={t("playoff")} /> : null}
                        <SessionStatusBadge
                          status={session.status}
                          label={org("statusActive")}
                        />
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500">
                      {session.team?.name ?? org("unknownTeam")}
                      {" · "}
                      {formatClubDateTimeRange(session.starts_at, session.ends_at, locale)}
                    </p>
                    {session.location ? (
                      <p className="text-sm text-zinc-500">{session.location}</p>
                    ) : null}
                    <span className="text-sm font-medium underline underline-offset-2">
                      {t("viewSession")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("myRegistrations")}
          </h2>
          {openRegistrations.length === 0 ? (
            <EmptyState title={t("emptyRegistrationsTitle")} body={t("emptyRegistrationsBody")} />
          ) : (
            <ul className="grid gap-3">
              {openRegistrations.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <RegistrationStatusBadge
                      status={row.status}
                      label={t(`statuses.${row.status}`)}
                    />
                    {row.session ? (
                      <SessionKindBadge
                        kind={row.session.kind}
                        label={t(`kinds.${row.session.kind}`)}
                      />
                    ) : null}
                    {row.session?.is_playoff ? <SessionPlayoffBadge label={t("playoff")} /> : null}
                    <span className="font-medium">
                      {row.player ? localizedPlayerName(row.player, locale) : t("unknownPlayer")}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500">
                    {row.session?.title ?? org("unknownTeam")}
                    {" · "}
                    {row.session?.team?.name ?? org("unknownTeam")}
                    {" · "}
                    {row.session
                      ? formatClubDateTimeRange(row.session.starts_at, row.session.ends_at, locale)
                      : ""}
                  </p>
                  {row.parent_note ? (
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {t("parentNote")}: {row.parent_note}
                    </p>
                  ) : null}
                  {row.session ? (
                    <Link
                      href={`/app/sessions/${row.session.id}`}
                      className="text-sm font-medium underline underline-offset-2"
                    >
                      {t("viewSession")}
                    </Link>
                  ) : null}
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