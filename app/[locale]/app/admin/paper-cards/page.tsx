import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RetryPhotoPurgeForm, StartPaperCardForm } from "@/components/paper-cards/paper-card-forms";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listCashPlayers } from "@/lib/cash/queries";
import { isPaperCardAiConfigured } from "@/lib/credits/paper-card-ai";
import { listPaperCards, loadPaperCardStats } from "@/lib/credits/paper-card-queries";
import { clubTodayDate } from "@/lib/org/session-calendar";
import { secondaryButtonClassName } from "@/lib/ui";

// The AI read-out runs in this page's Server Actions and can take ~30 seconds.
export const maxDuration = 120;

/** PR-09 (D7, D8-1): move paper session cards into the system. */
export default async function AdminPaperCardsPage({
  searchParams,
}: {
  searchParams: Promise<{
    done?: string;
    matched?: string;
    unmatched?: string;
    reversed?: string;
    balance?: string;
    photos?: string;
  }>;
}) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }
  const query = await searchParams;
  const t = await getTranslations("paperCards");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const [players, cards, stats] = await Promise.all([
    listCashPlayers(locale),
    listPaperCards(locale),
    loadPaperCardStats(clubTodayDate()),
  ]);
  const drafts = cards.filter((card) => card.status === "draft");
  const moved = cards.filter((card) => card.status !== "draft");

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12">
        <PageHeader title={t("title")} description={t("lead")} />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-zinc-100 px-3 py-1.5 dark:bg-zinc-800">
            {t("progress", { moved: stats.movedPlayers, roster: stats.rosterPlayers })}
          </span>
          <Link href="/app/admin/paper-cards/checks" className={secondaryButtonClassName}>
            {t("checksLink")}
          </Link>
        </div>

        {query.done ? (
          <section role="status" className="flex flex-col gap-1 rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50">
            <p className="text-base font-semibold">{t("doneTitle")}</p>
            <p>
              {t("doneBody", {
                matched: Number(query.matched ?? 0),
                unmatched: Number(query.unmatched ?? 0),
                reversed: Number(query.reversed ?? 0),
                balance: query.balance ?? "-",
              })}
            </p>
            {query.photos === "kept" ? <p>{t("photosKept")}</p> : <p>{t("photosRemoved")}</p>}
          </section>
        ) : null}

        <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold">{t("newCard")}</h2>
          <StartPaperCardForm players={players} aiConfigured={isPaperCardAiConfigured()} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("drafts")}</h2>
          {drafts.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("draftsEmpty")}</p>
          ) : (
            <ul className="grid gap-2">
              {drafts.map((card) => (
                <li key={card.id}>
                  <Link
                    href={`/app/admin/paper-cards/${card.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700 dark:bg-amber-950"
                  >
                    <span className="font-medium">{card.playerLabel}</span>
                    <span>{card.needs_manual ? t("needsManual") : t("readyToReview")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("moved")}</h2>
          {moved.length === 0 ? (
            <EmptyState title={t("movedEmptyTitle")} body={t("movedEmptyBody")} />
          ) : (
            <ul className="grid gap-3">
              {moved.map((card) => (
                <li
                  key={card.id}
                  className="flex flex-col gap-1.5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="font-medium">
                    {card.playerLabel}
                    {card.card_no ? ` · ${t("cardNoValue", { no: card.card_no })}` : ""}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-300">
                    {t("movedSummary", {
                      pkg: card.package_credits ?? 0,
                      used: card.used_dates.length,
                      remaining: card.remaining ?? 0,
                      date: (card.confirmed_at ?? "").slice(0, 10),
                    })}
                  </span>
                  {card.unmatchedDates.length > 0 ? (
                    <span className="text-amber-800 dark:text-amber-200">
                      {t("unmatchedDates", { dates: card.unmatchedDates.join("、") })}
                    </span>
                  ) : null}
                  {card.photo_paths.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-3 text-amber-800 dark:text-amber-200">
                      <span>{t("photosPending")}</span>
                      <RetryPhotoPurgeForm cardId={card.id} />
                    </div>
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
