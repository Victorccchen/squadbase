import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DirectorRoleForm, ReconcileForm } from "@/components/cash/cash-forms";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { loadSignedInAccount } from "@/lib/auth/session";
import { listDeposits, listDirectorProfiles, signSlipPaths } from "@/lib/cash/queries";
import { reconcileBlock } from "@/lib/cash/model";

/** PR-08b (D4): staff reconcile the director's deposits; the recorder never reconciles. */
export default async function AdminDepositsPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }
  const { user } = await loadSignedInAccount();
  const t = await getTranslations("cash");
  const credits = await getTranslations("credits");
  const common = await getTranslations("common");
  const [deposits, people] = await Promise.all([listDeposits(), listDirectorProfiles()]);
  const slipUrls = await signSlipPaths(deposits.map((row) => row.slip_path));
  const directors = people.filter((row) => row.isDirector);
  const others = people.filter((row) => !row.isDirector);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12">
        <PageHeader title={t("depositsAdminTitle")} description={t("depositsAdminLead")} />
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("depositsList")}</h2>
          {deposits.length === 0 ? (
            <EmptyState title={t("depositsEmptyTitle")} body={t("depositsEmptyBody")} />
          ) : (
            <ul className="grid gap-3">
              {deposits.map((deposit) => {
                const block = reconcileBlock({
                  userId: user.id,
                  recordedBy: deposit.recorded_by,
                  reconciledAt: deposit.reconciled_at,
                  amountTwd: deposit.amount_twd,
                  closingTotals: deposit.closings.map((row) => row.total_twd),
                });
                const closingsTotal = deposit.closings.reduce((sum, row) => sum + row.total_twd, 0);
                const slipUrl = deposit.slip_path ? slipUrls.get(deposit.slip_path) ?? null : null;
                return (
                  <li
                    key={deposit.id}
                    className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <span className="font-medium">
                      {deposit.deposit_date} · {credits("priceTwd", { amount: deposit.amount_twd })}
                      {deposit.reconciled_at ? ` · ${t("reconciled")}` : ""}
                    </span>
                    <span className="text-zinc-500">
                      {t("closingsCovered", {
                        dates: deposit.closings.map((row) => row.closing_date).join("、"),
                        total: closingsTotal,
                      })}
                    </span>
                    {deposit.note ? <span className="text-zinc-500">{deposit.note}</span> : null}
                    {slipUrl ? (
                      <a href={slipUrl} target="_blank" rel="noreferrer" className="w-fit font-medium underline underline-offset-2">
                        {t("viewSlip")}
                      </a>
                    ) : null}
                    {deposit.reconciled_at ? null : (
                      <ReconcileForm
                        depositId={deposit.id}
                        disabledReason={
                          block === "ownDeposit"
                            ? t("blockOwnDeposit")
                            : block === "amountMismatch"
                              ? t("blockMismatch", { amount: deposit.amount_twd, total: closingsTotal })
                              : null
                        }
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("directorsTitle")}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("directorsLead")}</p>
          <ul className="grid gap-2">
            {directors.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <span className="font-medium">{row.label}</span>
                <DirectorRoleForm userId={row.id} isDirector />
              </li>
            ))}
          </ul>
          <details className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm dark:border-zinc-700">
            <summary className="cursor-pointer font-medium">{t("addDirector")}</summary>
            <ul className="mt-3 grid max-h-80 gap-2 overflow-y-auto">
              {others.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3">
                  <span>{row.label}</span>
                  <DirectorRoleForm userId={row.id} isDirector={false} />
                </li>
              ))}
            </ul>
          </details>
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
