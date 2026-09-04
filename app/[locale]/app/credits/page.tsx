import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ClaimForm } from "@/components/credits/claim-form";
import { CopyTextButton } from "@/components/credits/copy-text-button";
import { listOwnGuardianLinks } from "@/lib/org/queries";
import { approvedChildrenFromLinks } from "@/lib/org/session-queries";
import {
  getBankTransferHint,
  listAttendedCounts,
  listBalancesForPlayers,
  listOwnPaymentClaims,
  listPrimaryPackages,
} from "@/lib/credits/queries";
import {
  catalogBandFromTeamAgeBand,
  creditsApplyToAgeBand,
  isLowBalance,
} from "@/lib/credits/debit-rules";
import { localizedPlayerName } from "@/lib/org/display-name";
import { secondaryButtonClassName } from "@/lib/ui";

export default async function ParentCreditsPage() {
  const t = await getTranslations("credits");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const links = await listOwnGuardianLinks();
  const children = approvedChildrenFromLinks(links);
  const playerIds = children.map((child) => child.player.id);
  const [balances, attended, packages, claims, transferHint] = await Promise.all([
    listBalancesForPlayers(playerIds),
    listAttendedCounts(playerIds),
    listPrimaryPackages(),
    listOwnPaymentClaims(),
    getBankTransferHint(),
  ]);

  const balanceByPlayer = new Map(balances.map((row) => [row.player_id, row.credits_available]));
  const eligibleBuyers = children.filter((child) => creditsApplyToAgeBand(child.teamAgeBand));
  const packagesForBuyers = packages.filter((pkg) =>
    eligibleBuyers.some((child) => catalogBandFromTeamAgeBand(child.teamAgeBand) === pkg.age_band),
  );

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-12">
        <PageHeader
          title={t("title")}
          description={t("lead")}
          actions={
            <Link href="/app/sessions" className={secondaryButtonClassName}>
              {t("openSessions")}
            </Link>
          }
        />

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("balancesTitle")}
          </h2>
          {children.length === 0 ? (
            <EmptyState title={t("emptyChildrenTitle")} body={t("emptyChildrenBody")} />
          ) : (
            <ul className="grid gap-3">
              {children.map((child) => {
                const remaining = balanceByPlayer.get(child.player.id) ?? 0;
                const attendedCount = attended.get(child.player.id) ?? 0;
                const applies = creditsApplyToAgeBand(child.teamAgeBand);
                const low = applies && isLowBalance(remaining);
                return (
                  <li
                    key={child.player.id}
                    className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <span className="font-semibold">
                      {localizedPlayerName(child.player, locale)}
                    </span>
                    <span className="text-sm text-zinc-500">
                      {child.teamName} · #{child.jerseyNumber} · {org(`ageBands.${child.teamAgeBand}`)}
                    </span>
                    {applies ? (
                      <>
                        <p className="text-sm">
                          {t("remainingCredits", { count: remaining })} · {t("attendedCount", { count: attendedCount })}
                        </p>
                        {low ? (
                          <div className="flex flex-col gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                            <p>{t("lowBalance")}</p>
                            <CopyTextButton
                              text={transferHint || t("transferHintMissing")}
                              label={t("copyTransferHint")}
                              copiedLabel={t("copied")}
                            />
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-zinc-500">{t("noDebitBand")}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("buyTitle")}
          </h2>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("buyLead")}</p>
          <ClaimForm
            childrenOptions={eligibleBuyers}
            packages={packagesForBuyers}
            locale={locale}
            transferHint={transferHint}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("claimsTitle")}
          </h2>
          {claims.length === 0 ? (
            <EmptyState title={t("emptyClaimsTitle")} body={t("emptyClaimsBody")} />
          ) : (
            <ul className="grid gap-3">
              {claims.map((claim) => (
                <li
                  key={claim.id}
                  className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="font-medium">
                    {claim.player ? localizedPlayerName(claim.player, locale) : t("unknownPlayer")}
                    {claim.package
                      ? ` · ${t("creditsCount", { count: claim.package.credits })} · ${t("priceTwd", { amount: claim.package.price_twd })}`
                      : ""}
                  </span>
                  <span className="text-zinc-500">
                    {t(`claimStatuses.${claim.status}`)} · {t("last5Value", { last5: claim.last5 })}
                  </span>
                  {claim.admin_note ? (
                    <span className="text-zinc-500">
                      {t("adminNote")}: {claim.admin_note}
                    </span>
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
