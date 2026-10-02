import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PrintButton } from "@/components/venues/print-button";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { parseUuid } from "@/lib/org/parse";
import { getVenue, venueQr } from "@/lib/venues/queries";
import zhHant from "@/messages/zh-Hant.json";
import ja from "@/messages/ja.json";
import en from "@/messages/en.json";

/**
 * PR-07: A4 sign for the counter. Uses the browser's "Save as PDF" to make a
 * printable PDF. The instruction is always shown in all three languages.
 */
export default async function VenuePrintPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }
  const { id } = await params;
  const venue = parseUuid(id) ? await getVenue(id) : null;
  if (!venue) {
    notFound();
  }
  const t = await getTranslations("venues");
  const qr = await venueQr(venue);
  const lines = [zhHant.venues.signInstruction, ja.venues.signInstruction, en.venues.signInstruction];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[210mm] flex-col items-center gap-8 bg-white px-8 py-12 text-zinc-950">
      <PrintButton label={t("print")} />
      <h1 className="text-center text-4xl font-bold">{venue.name}</h1>
      <div
        className="w-[120mm]"
        role="img"
        aria-label={t("qrAlt", { name: venue.name })}
        dangerouslySetInnerHTML={{ __html: qr.svg }}
      />
      <ul className="flex flex-col items-center gap-3 text-center text-2xl">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {!qr.stableOrigin ? (
        <p className="text-sm text-amber-800 print:hidden">{t("unstableOrigin")}</p>
      ) : null}
    </main>
  );
}
