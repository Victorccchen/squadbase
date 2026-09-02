import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";
import { getPlayer } from "@/lib/org/queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { ageBandFromBirthDate, formatIsoDate, seasonStartForBirthDate } from "@/lib/age-band";
import { secondaryButtonClassName } from "@/lib/ui";

type PlayerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlayerDetailPage({ params }: PlayerDetailPageProps) {
  const { id } = await params;
  const player = await getPlayer(id);
  if (!player) {
    notFound();
  }

  const t = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const band = ageBandFromBirthDate(player.birth_date);
  const seasonStart = seasonStartForBirthDate();

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={localizedPlayerName(player, locale)}
          actions={
            <Link
              href={`/app/admin/players/${player.id}/edit`}
              className={secondaryButtonClassName}
            >
              {t("edit")}
            </Link>
          }
        />
        <dl className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("nameZh")}</dt>
            <dd className="font-medium">{player.name_zh}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("nameEn")}</dt>
            <dd className="font-medium">{player.name_en}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("nameJa")}</dt>
            <dd className="font-medium">{player.name_ja}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("birthDate")}</dt>
            <dd className="font-medium">{player.birth_date}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("suggestedAgeBand")}</dt>
            <dd className="font-medium">
              {band ? org(`ageBands.${band}`) : org("ageBandUnknown")}
            </dd>
          </div>
          {seasonStart ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{org("seasonStart")}</dt>
              <dd className="font-medium">{formatIsoDate(seasonStart)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("team")}</dt>
            <dd className="font-medium">{player.membership?.team?.name ?? org("noTeam")}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("jerseyNumber")}</dt>
            <dd className="font-medium">
              {player.membership ? `#${player.membership.jersey_number}` : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("status")}</dt>
            <dd className="font-medium">
              {org(player.status === "active" ? "statusActive" : "statusInactive")}
            </dd>
          </div>
        </dl>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
