import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { VenueForm } from "@/components/venues/venue-form";
import { RegenerateTokenForm } from "@/components/venues/regenerate-token-form";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listVenues, venueQr } from "@/lib/venues/queries";
import { secondaryButtonClassName } from "@/lib/ui";

/** PR-07: venues and their counter QR codes. */
export default async function AdminVenuesPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }
  const t = await getTranslations("venues");
  const common = await getTranslations("common");
  const venues = await listVenues();
  const qrs = await Promise.all(venues.map((venue) => venueQr(venue)));

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("title")} description={t("lead")} />
        <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("newTitle")}</h2>
          <VenueForm />
        </section>
        {venues.length === 0 ? (
          <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
        ) : (
          <ul className="grid gap-4">
            {venues.map((venue, index) => {
              const qr = qrs[index]!;
              return (
                <li
                  key={venue.id}
                  className="grid gap-5 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-[200px_1fr]"
                >
                  <div className="flex flex-col items-start gap-2">
                    <div
                      className="w-[200px] rounded-xl bg-white p-2"
                      aria-label={t("qrAlt", { name: venue.name })}
                      role="img"
                      dangerouslySetInnerHTML={{ __html: qr.svg }}
                    />
                    {!qr.stableOrigin ? (
                      <p className="text-xs text-amber-800 dark:text-amber-200">{t("unstableOrigin")}</p>
                    ) : null}
                    <a
                      href={qr.pngDataUrl}
                      download={`checkin-${venue.name}.png`}
                      className={secondaryButtonClassName}
                    >
                      {t("downloadPng")}
                    </a>
                    <Link href={`/app/admin/venues/${venue.id}/print`} className={secondaryButtonClassName}>
                      {t("printable")}
                    </Link>
                  </div>
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-zinc-500">
                      {venue.active ? t("activeLabel") : t("inactiveLabel")}
                    </p>
                    <VenueForm venue={venue} />
                    <RegenerateTokenForm venueId={venue.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
