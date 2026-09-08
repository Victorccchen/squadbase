import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PlayerPhotoThumb } from "@/components/players/player-photo-thumb";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listPlayers, formatActiveMembershipSummary } from "@/lib/org/queries";
import { signPlayerStoragePaths } from "@/lib/org/player-photo-queries";
import {
  filterPlayersMissingHeadshot,
  isMissingHeadshotFilter,
  playerHasHeadshot,
  playerHasIdPdf,
} from "@/lib/org/player-photos";
import { localizedPlayerName } from "@/lib/org/display-name";
import { ageBandFromBirthDate } from "@/lib/age-band";
import { primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";

type AdminPlayersPageProps = {
  searchParams: Promise<{ missingHeadshot?: string | string[] }>;
};

export default async function AdminPlayersPage({ searchParams }: AdminPlayersPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const params = await searchParams;
  const missingOnly = isMissingHeadshotFilter(params.missingHeadshot);
  const t = await getTranslations("admin");
  const photos = await getTranslations("photos");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const allPlayers = await listPlayers();
  const players = missingOnly ? filterPlayersMissingHeadshot(allPlayers) : allPlayers;
  const signed = await signPlayerStoragePaths(players.map((player) => player.photo_path));

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("playersTitle")}
          description={t("playersBody")}
          actions={
            <Link href="/app/admin/players/new" className={primaryButtonClassName}>
              {t("createPlayer")}
            </Link>
          }
        />
        <form className="flex flex-wrap items-center gap-3" method="get">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="missingHeadshot" value="1" defaultChecked={missingOnly} />
            {photos("missingFilter")}
          </label>
          <button type="submit" className={secondaryButtonClassName}>
            {t("applyFilters")}
          </button>
          {missingOnly ? (
            <Link href="/app/admin/players" className="text-sm font-medium underline underline-offset-2">
              {photos("showAll")}
            </Link>
          ) : null}
        </form>
        {players.length === 0 ? (
          <EmptyState
            title={missingOnly ? photos("listMissingEmptyTitle") : t("playersEmptyTitle")}
            body={missingOnly ? photos("listMissingEmptyBody") : t("playersEmptyBody")}
          />
        ) : (
          <ul className="grid gap-3">
            {players.map((player) => {
              const band = ageBandFromBirthDate(player.birth_date);
              const url = player.photo_path ? (signed.get(player.photo_path) ?? null) : null;
              return (
                <li key={player.id}>
                  <Link
                    href={`/app/admin/players/${player.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <PlayerPhotoThumb
                      url={url}
                      alt={localizedPlayerName(player, locale)}
                      missingLabel={photos("missing")}
                      hasPdf={playerHasIdPdf(player) && !playerHasHeadshot(player)}
                      pdfLabel={photos("hasPdf")}
                    />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="font-semibold">
                        {localizedPlayerName(player, locale)}
                      </span>
                      <span className="text-sm text-zinc-500">
                        {formatActiveMembershipSummary(player.memberships) ?? org("noTeam")}
                        {" · "}
                        {band ? org(`ageBands.${band}`) : org("ageBandUnknown")}
                      </span>
                    </span>
                    {playerHasIdPdf(player) && playerHasHeadshot(player) ? (
                      <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {photos("hasPdf")}
                      </span>
                    ) : null}
                  </Link>
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
