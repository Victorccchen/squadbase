import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PaperCheckForm } from "@/components/paper-cards/paper-card-forms";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listCashPlayers } from "@/lib/cash/queries";
import { listPaperCardChecks, loadPaperCardStats } from "@/lib/credits/paper-card-queries";
import { clubTodayDate } from "@/lib/org/session-calendar";

/** PR-09 (D7): weekly spot check of paper cards against the system during the parallel season. */
export default async function AdminPaperCardChecksPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }
  const t = await getTranslations("paperCards");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const [players, checks, stats] = await Promise.all([
    listCashPlayers(locale),
    listPaperCardChecks(locale),
    loadPaperCardStats(clubTodayDate()),
  ]);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <Link href="/app/admin/paper-cards" className="w-fit text-sm font-medium underline underline-offset-2">
          {t("back")}
        </Link>
        <PageHeader title={t("checksTitle")} description={t("checksLead")} />
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {t("seasonChecks", { checks: stats.seasonChecks, mismatches: stats.seasonMismatches })}
        </p>
        <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <PaperCheckForm players={players} />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("recentChecks")}</h2>
          {checks.length === 0 ? (
            <EmptyState title={t("checksEmptyTitle")} body={t("checksEmptyBody")} />
          ) : (
            <ul className="grid gap-2">
              {checks.map((check) => (
                <li
                  key={check.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${
                    check.matches
                      ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      : "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
                  }`}
                >
                  <span className="font-medium">
                    {check.check_date} · {check.playerLabel}
                  </span>
                  <span>
                    {check.matches
                      ? t("checkMatches", { count: check.card_remaining })
                      : t("checkMismatch", { card: check.card_remaining, system: check.system_remaining })}
                    {check.note ? ` · ${check.note}` : ""}
                  </span>
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
