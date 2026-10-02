import { getLocale, getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { RecordCashForm } from "@/components/cash/record-cash-form";
import { CloseDayForm, DepositForm, VoidReceiptForm } from "@/components/cash/cash-forms";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canHandleCash } from "@/lib/auth/roles";
import { listCashPlayers, listCashReceipts, listClosings } from "@/lib/cash/queries";
import { openReceiptDays } from "@/lib/cash/model";
import { listPaymentItems } from "@/lib/payments/queries";
import { paymentItemName } from "@/lib/payments/model";
import { listPrimaryPackages } from "@/lib/credits/queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { clubTodayDate } from "@/lib/org/session-calendar";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/supabase/database.types";

/** PR-08b (D13): the youth director's cash page, made for a phone at the field. */
export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string; deposited?: string }>;
}) {
  const { user, roles } = await loadSignedInAccount();
  if (!canHandleCash(roles)) {
    return <AccessDenied area="admin" />;
  }
  const query = await searchParams;
  const t = await getTranslations("cash");
  const credits = await getTranslations("credits");
  const tasksT = await getTranslations("tasks");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const supabase = await createClient();
  const [players, items, packages, receipts, closings, tasksResult] = await Promise.all([
    listCashPlayers(locale),
    listPaymentItems(),
    listPrimaryPackages(),
    listCashReceipts({ receivedBy: user.id, limit: 100 }),
    listClosings({ closedBy: user.id }),
    supabase
      .from("tasks")
      .select("*")
      .eq("assignee_role", "director")
      .in("status", ["open", "snoozed"])
      .order("created_at"),
  ]);
  const packageBands = Object.fromEntries(packages.map((pkg) => [pkg.id, pkg.age_band]));
  const reportItems = items.filter(
    (item) => item.kind !== "credit_package" || (item.package_id !== null && item.package_id in packageBands),
  );
  const openDays = openReceiptDays(receipts);
  const undeposited = closings.filter((row) => !row.depositId);
  const today = clubTodayDate();
  const directorTasks = (tasksResult.data ?? []) as Task[];

  return (
    <>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-4 py-8">
        <PageHeader title={t("title")} description={t("lead")} />
        {query.closed === "1" ? (
          <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            {t("closedDone")}
          </p>
        ) : null}
        {query.deposited === "1" ? (
          <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            {t("depositedDone")}
          </p>
        ) : null}

        {directorTasks.length > 0 ? (
          <section className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
            <h2 className="font-semibold">{t("todo")}</h2>
            <ul className="list-disc pl-5">
              {directorTasks.map((task) => (
                <li key={task.id}>
                  {tasksT(`kinds.${task.kind.replace(".", "_")}`)}
                  {typeof task.params?.date === "string" ? ` · ${task.params.date}` : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("recordTitle")}</h2>
          <RecordCashForm players={players} items={reportItems} packageBands={packageBands} locale={locale} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("openTitle")}</h2>
          {openDays.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("openEmpty")}</p>
          ) : (
            openDays.map((day) => (
              <div key={day.date} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-base font-semibold">
                  {day.date} · {t("dayTotal", { count: day.count, total: day.total })}
                </p>
                <ul className="flex flex-col gap-3 text-sm">
                  {day.receipts.map((receipt) => (
                    <li key={receipt.id} className="flex flex-col gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                      <span className="font-medium">
                        {receipt.receipt_no} · {credits("priceTwd", { amount: receipt.amount_twd })}
                      </span>
                      <span className="text-zinc-500">
                        {receipt.player ? localizedPlayerName(receipt.player, locale) : ""}
                        {receipt.item ? ` · ${paymentItemName(receipt.item, locale)}` : ""}
                      </span>
                      <VoidReceiptForm receiptId={receipt.id} />
                    </li>
                  ))}
                </ul>
                <CloseDayForm
                  day={day.date}
                  label={t("closeDay")}
                  confirmMessage={t("closeConfirm", { count: day.count, total: day.total })}
                />
              </div>
            ))
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("depositTitle")}</h2>
          {undeposited.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("depositEmpty")}</p>
          ) : (
            <DepositForm
              today={today}
              closings={undeposited.map((row) => ({
                id: row.id,
                label: `${row.closing_date} · ${t("dayTotal", { count: row.receipt_count, total: row.total_twd })}`,
                total: row.total_twd,
              }))}
            />
          )}
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
