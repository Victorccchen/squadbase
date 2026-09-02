import { getLocale, getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessRoster } from "@/lib/auth/roles";
import { listRoster } from "@/lib/org/queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { ageBandFromBirthDate } from "@/lib/age-band";

export default async function RosterPage() {
  const { roles } = await loadSignedInAccount();
  if (!canAccessRoster(roles)) {
    return <AccessDenied area="roster" />;
  }

  const t = await getTranslations("roster");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const rows = await listRoster();

  const byTeam = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byTeam.get(row.team.id) ?? [];
    list.push(row);
    byTeam.set(row.team.id, list);
  }

  const teams = [...byTeam.values()]
    .map((list) => ({
      team: list[0].team,
      players: [...list].sort((a, b) => a.membership.jersey_number - b.membership.jersey_number),
    }))
    .sort((a, b) => a.team.name.localeCompare(b.team.name));

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("title")} description={t("lead")} />
        {teams.length === 0 ? (
          <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
        ) : (
          teams.map((group) => (
            <section key={group.team.id} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {group.team.name} · {org(`ageBands.${group.team.age_band}`)}
              </h2>
              <ul className="grid gap-2">
                {group.players.map((row) => {
                  const band = ageBandFromBirthDate(row.player.birth_date);
                  return (
                    <li
                      key={row.membership.id}
                      className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="font-medium">
                        #{row.membership.jersey_number} {localizedPlayerName(row.player, locale)}
                      </span>
                      <span className="text-sm text-zinc-500">
                        {row.player.name_zh} · {row.player.name_en} · {row.player.name_ja}
                        {" · "}
                        {band ? org(`ageBands.${band}`) : org("ageBandUnknown")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
