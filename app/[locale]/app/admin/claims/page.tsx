import { getLocale, getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ClaimReviewForm } from "@/components/credits/claim-review-form";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listPaymentClaimsForAdmin } from "@/lib/credits/queries";
import { localizedPlayerName } from "@/lib/org/display-name";

export default async function AdminClaimsPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("credits");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const claims = await listPaymentClaimsForAdmin();
  const pending = claims.filter((row) => row.status === "pending");
  const others = claims.filter((row) => row.status !== "pending");

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12">
        <PageHeader title={t("adminClaimsTitle")} description={t("adminClaimsLead")} />

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("pendingClaims")}
          </h2>
          {pending.length === 0 ? (
            <EmptyState title={t("emptyPendingClaimsTitle")} body={t("emptyPendingClaimsBody")} />
          ) : (
            <ul className="grid gap-4">
              {pending.map((claim) => (
                <li
                  key={claim.id}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">
                      {claim.player ? localizedPlayerName(claim.player, locale) : t("unknownPlayer")}
                    </span>
                    <span className="text-zinc-500">
                      {claim.package
                        ? `${t(`bands.${claim.package.age_band}`)} · ${t("creditsCount", { count: claim.package.credits })} · ${t("priceTwd", { amount: claim.package.price_twd })}`
                        : ""}
                    </span>
                    <span className="text-zinc-500">{t("last5Value", { last5: claim.last5 })}</span>
                  </div>
                  <ClaimReviewForm claimId={claim.id} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {others.length > 0 ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {t("claimHistory")}
            </h2>
            <ul className="grid gap-3">
              {others.map((claim) => (
                <li
                  key={claim.id}
                  className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="font-medium">
                    {claim.player ? localizedPlayerName(claim.player, locale) : t("unknownPlayer")}
                    {" · "}
                    {t(`claimStatuses.${claim.status}`)}
                  </span>
                  <span className="text-zinc-500">
                    {claim.package
                      ? `${t("creditsCount", { count: claim.package.credits })} · ${t("priceTwd", { amount: claim.package.price_twd })}`
                      : ""}
                    {` · ${t("last5Value", { last5: claim.last5 })}`}
                  </span>
                  {claim.admin_note ? (
                    <span className="text-zinc-500">
                      {t("adminNote")}: {claim.admin_note}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
