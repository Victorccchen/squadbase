import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SessionStatusForm } from "@/components/admin/session-status-form";
import { SessionStatusBadge } from "@/components/sessions/session-status-badge";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listSessionsForAdmin } from "@/lib/org/session-queries";
import { setSessionStatus } from "@/lib/org/session-actions";
import { formatClubDateTimeRange } from "@/lib/org/session-time";
import { primaryButtonClassName } from "@/lib/ui";

export default async function AdminSessionsPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const sessions = await listSessionsForAdmin();

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("sessionsTitle")}
          description={t("sessionsBody")}
          actions={
            <Link href="/app/admin/sessions/new" className={primaryButtonClassName}>
              {t("createSession")}
            </Link>
          }
        />
        {sessions.length === 0 ? (
          <EmptyState title={t("sessionsEmptyTitle")} body={t("sessionsEmptyBody")} />
        ) : (
          <ul className="grid gap-3">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/app/admin/sessions/${session.id}`}
                      className="font-semibold hover:underline"
                    >
                      {session.team?.name ?? org("unknownTeam")}
                    </Link>
                    <p className="text-sm text-zinc-500">
                      {formatClubDateTimeRange(session.starts_at, session.ends_at, locale)}
                    </p>
                    {session.location ? (
                      <p className="text-sm text-zinc-500">{session.location}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SessionStatusBadge
                      status={session.status}
                      label={org(session.status === "active" ? "statusActive" : "statusInactive")}
                    />
                    <span className="text-sm text-zinc-500">
                      {t("rosterCount", { count: session.registeredCount })}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/app/admin/sessions/${session.id}/edit`}
                    className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    {t("edit")}
                  </Link>
                  <SessionStatusForm
                    status={session.status}
                    action={setSessionStatus.bind(null, session.id)}
                    redirectTo="list"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}