import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import {
  DiscardPaperCardForm,
  RerunExtractionForm,
  ReviewPaperCardForm,
} from "@/components/paper-cards/paper-card-forms";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { isPaperCardAiConfigured } from "@/lib/credits/paper-card-ai";
import { normalizeCells, reviewCells, type PaperCardCell } from "@/lib/credits/paper-card";
import { getPaperCard, playerSessionDates, signCardPhotos } from "@/lib/credits/paper-card-queries";
import { clubTodayDate } from "@/lib/org/session-calendar";
import { createClient } from "@/lib/supabase/server";

function storedCells(extracted: Record<string, unknown> | null): PaperCardCell[] {
  const raw = extracted?.cells;
  if (!Array.isArray(raw)) {
    return normalizeCells([]);
  }
  return normalizeCells(
    raw.filter(
      (cell): cell is PaperCardCell =>
        Boolean(cell) &&
        typeof cell === "object" &&
        typeof (cell as PaperCardCell).index === "number" &&
        typeof (cell as PaperCardCell).text === "string",
    ),
  );
}

// The AI read-out runs in this page's Server Actions and can take ~30 seconds.
export const maxDuration = 120;

/** PR-09: check the read-out cell by cell, then move the card in. */
export default async function AdminPaperCardPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }
  const { id } = await params;
  const locale = await getLocale();
  const card = await getPaperCard(id, locale);
  if (!card) {
    notFound();
  }
  const t = await getTranslations("paperCards");
  const common = await getTranslations("common");
  const today = clubTodayDate();
  const supabase = await createClient();
  const [photoUrls, sessionDates, { data: balance }] = await Promise.all([
    signCardPhotos(card.photo_paths),
    playerSessionDates(card.player_id, today),
    supabase.from("player_session_balances").select("credits_available").eq("player_id", card.player_id).maybeSingle(),
  ]);
  const cells = reviewCells(storedCells(card.extracted), { sessionDates, today });
  const aiStatus = typeof card.extracted?.status === "string" ? card.extracted.status : null;

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <Link href="/app/admin/paper-cards" className="w-fit text-sm font-medium underline underline-offset-2">
          {t("back")}
        </Link>
        <PageHeader title={t("reviewTitle", { name: card.playerLabel })} description={t("reviewLead")} />

        {card.status !== "draft" ? (
          <p className="rounded-2xl bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
            {t("alreadyMoved", { date: (card.confirmed_at ?? "").slice(0, 10), remaining: card.remaining ?? 0 })}
          </p>
        ) : (
          <>
            {card.needs_manual ? (
              <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50">
                {aiStatus ? t("aiFailed") : t("manualEntry")}
              </p>
            ) : null}
            {card.squad_marks.length > 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("squadMarks", { marks: card.squad_marks.join(" ") })}</p>
            ) : null}
            {photoUrls.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {photoUrls.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {/* Signed private URL, short-lived: next/image would cache it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={t("photoAlt", { n: i + 1 })} className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800" />
                  </a>
                ))}
              </div>
            ) : null}
            <ReviewPaperCardForm
              cardId={card.id}
              cells={cells}
              cardNo={card.card_no ?? ""}
              packageCredits={card.package_credits}
              today={today}
              systemBalance={balance?.credits_available ?? 0}
            />
            <div className="flex flex-wrap items-start gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              {isPaperCardAiConfigured() && card.photo_paths.length > 0 ? <RerunExtractionForm cardId={card.id} /> : null}
              <DiscardPaperCardForm cardId={card.id} />
            </div>
          </>
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
