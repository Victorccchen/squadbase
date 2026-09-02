import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listPlayers } from "@/lib/org/queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { ageBandFromBirthDate } from "@/lib/age-band";
import { primaryButtonClassName } from "@/lib/ui";

export default async function AdminPlayersPage() {
  const t = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const players = await listPlayers();

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
        {players.length === 0 ? (
          <EmptyState title={t("playersEmptyTitle")} body={t("playersEmptyBody")} />
        ) : (
          <ul className="grid gap-3">
            {players.map((player) => {
              const band = ageBandFromBirthDate(player.birth_date);
              return (
                <li key={player.id}>
                  <Link
                    href={`/app/admin/players/${player.id}`}
                    className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <span className="font-semibold">
                      {localizedPlayerName(player, locale)}
                    </span>
                    <span className="text-sm text-zinc-500">
                      {player.membership?.team
                        ? `${player.membership.team.name} · #${player.membership.jersey_number}`
                        : org("noTeam")}
                      {" · "}
                      {band ? org(`ageBands.${band}`) : org("ageBandUnknown")}
                    </span>
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
