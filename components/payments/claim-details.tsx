import { getTranslations } from "next-intl/server";
import { paymentItemName } from "@/lib/payments/model";
import type { PaymentClaimWithDetails } from "@/lib/credits/queries";

/** PR-08a: every field of a transfer report, for staff review. */
export async function ClaimDetails({
  claim,
  locale,
  proofUrl,
}: {
  claim: PaymentClaimWithDetails;
  locale: string;
  proofUrl: string | null;
}) {
  const t = await getTranslations("payments");
  const credits = await getTranslations("credits");
  return (
    <dl className="grid gap-1 text-sm text-zinc-600 dark:text-zinc-300 sm:grid-cols-2">
      <div>
        <dt className="inline text-zinc-500">{t("item")}: </dt>
        <dd className="inline">
          {claim.item ? paymentItemName(claim.item, locale) : "—"}
          {claim.credits_snapshot ? ` · ${credits("creditsCount", { count: claim.credits_snapshot })}` : ""}
        </dd>
      </div>
      <div>
        <dt className="inline text-zinc-500">{t("amount")}: </dt>
        <dd className="inline">{credits("priceTwd", { amount: claim.amount_twd })}</dd>
      </div>
      <div>
        <dt className="inline text-zinc-500">{t("transferDate")}: </dt>
        <dd className="inline">{claim.transfer_date ?? "—"}</dd>
      </div>
      <div>
        <dt className="inline text-zinc-500">{credits("last5")}: </dt>
        <dd className="inline">{claim.last5}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="inline text-zinc-500">{t("invoice")}: </dt>
        <dd className="inline">
          {claim.invoice_needed
            ? [claim.invoice_tax_id ? t("taxIdValue", { taxId: claim.invoice_tax_id }) : t("noTaxId"), claim.invoice_title]
                .filter(Boolean)
                .join(" · ")
            : t("invoiceNotNeeded")}
        </dd>
      </div>
      {proofUrl ? (
        <div className="sm:col-span-2">
          <a href={proofUrl} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
            {t("viewScreenshot")}
          </a>
        </div>
      ) : null}
    </dl>
  );
}
