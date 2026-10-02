import { getLocale, getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { AdjustCreditsForm } from "@/components/credits/adjust-credits-form";
import { NewPackageForm, PackageRowForm } from "@/components/credits/package-form";
import { TransferHintForm } from "@/components/credits/transfer-hint-form";
import { PaymentItemForm } from "@/components/payments/payment-item-form";
import { listPaymentItems } from "@/lib/payments/queries";
import { paymentItemName } from "@/lib/payments/model";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import {
  getBankTransferHint,
  listClaimedPackageIds,
  listCreditTotalsForAdmin,
  listPackagesForAdmin,
  listPlayersForAdminCredits,
} from "@/lib/credits/queries";

export default async function AdminCreditsPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("credits");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const payments = await getTranslations("payments");
  const [packages, players, totals, transferHint, claimedPackageIds, items] = await Promise.all([
    listPackagesForAdmin(),
    listPlayersForAdminCredits(),
    listCreditTotalsForAdmin(),
    getBankTransferHint(),
    listClaimedPackageIds(),
    listPaymentItems({ includeInactive: true }),
  ]);
  const otherItems = items.filter((item) => item.kind !== "credit_package");

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12">
        <PageHeader title={t("adminCreditsTitle")} description={t("adminCreditsLead")} />

        <section className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
          <p>
            {t("parentContribution", {
              amount: Math.round(totals.parentContributionTwd),
              count: totals.approvedClaimCount,
            })}
          </p>
          <p>
            {t("playerContribution", {
              amount: Math.round(totals.playerContributionTwd),
              count: totals.debitCount,
            })}
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("transferHintTitle")}
          </h2>
          <TransferHintForm currentHint={transferHint} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("adjustTitle")}
          </h2>
          <AdjustCreditsForm players={players} locale={locale} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("packagesTitle")}
          </h2>
          <ul className="grid gap-4">
            {packages.map((pkg) => (
              <li
                key={pkg.id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <p className="text-sm font-medium">
                  {t(`bands.${pkg.age_band}`)} · {t("creditsCount", { count: pkg.credits })}
                </p>
                <PackageRowForm pkg={pkg} priceLocked={claimedPackageIds.has(pkg.id)} />
              </li>
            ))}
          </ul>
          <div className="rounded-2xl border border-dashed border-zinc-300 p-5 dark:border-zinc-700">
            <h3 className="mb-3 text-sm font-medium">{t("addPackageTitle")}</h3>
            <NewPackageForm />
          </div>
        </section>
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {payments("itemsTitle")}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{payments("itemsLead")}</p>
          <ul className="grid gap-3">
            {otherItems.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="text-sm font-medium">
                  {paymentItemName(item, locale)} · {payments(`kinds.${item.kind}`)}
                  {item.active ? "" : ` · ${payments("itemInactive")}`}
                </span>
                <PaymentItemForm item={item} />
              </li>
            ))}
          </ul>
          <div className="rounded-2xl border border-dashed border-zinc-300 p-5 dark:border-zinc-700">
            <h3 className="mb-3 text-sm font-medium">{payments("addItem")}</h3>
            <PaymentItemForm />
          </div>
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
