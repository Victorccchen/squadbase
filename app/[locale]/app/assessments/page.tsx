import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { AssessmentSummary } from "@/components/assessments/assessment-summary";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin, canAccessRoster, canWriteAssessments } from "@/lib/auth/roles";
import { listLatestAssessmentsByPlayerId } from "@/lib/assessments/queries";
import { listOwnGuardianLinks, listPlayers, listRoster } from "@/lib/org/queries";
import { uniqueApprovedLinksByPlayerId } from "@/lib/org/guardian-links";
import { localizedPlayerName } from "@/lib/org/display-name";
import type { Player } from "@/lib/supabase/database.types";
import { primaryButtonClassName } from "@/lib/ui";

export default async function AssessmentsIndexPage() {
  const t = await getTranslations("assessments");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const { roles } = await loadSignedInAccount();
  const isAdmin = canAccessAdmin(roles);
  const isStaff = canWriteAssessments(roles);
  const canRoster = canAccessRoster(roles);

  const staffPlayers: Player[] = [];
  if (isAdmin) {
    staffPlayers.push(...(await listPlayers()));
  } else if (canRoster) {
    const seen = new Set<string>();
    for (const row of await listRoster()) {
      if (seen.has(row.player.id)) {
        continue;
      }
      seen.add(row.player.id);
      staffPlayers.push(row.player);
    }
  }

  const parentLinks = uniqueApprovedLinksByPlayerId(await listOwnGuardianLinks());
  const parentPlayers = parentLinks
    .map((link) => link.player)
    .filter((player): player is NonNullable<typeof player> => player !== null);

  const allIds = [
    ...new Set([
      ...staffPlayers.map((player) => player.id),
      ...parentPlayers.map((player) => player.id),
    ]),
  ];
  const latest = await listLatestAssessmentsByPlayerId(allIds);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("title")} description={t("lead")} />

        {isStaff ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {t("staffListTitle")}
            </h2>
            {staffPlayers.length === 0 ? (
              <EmptyState title={t("staffEmptyTitle")} body={t("staffEmptyBody")} />
            ) : (
              <ul className="grid gap-3">
                {staffPlayers.map((player) => {
                  const assessment = latest.get(player.id);
                  return (
                    <li
                      key={player.id}
                      className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <span className="font-semibold">
                        {localizedPlayerName(player, locale)}
                      </span>
                      {assessment ? (
                        <AssessmentSummary assessment={assessment} />
                      ) : (
                        <p className="text-sm text-zinc-500">{t("noLatest")}</p>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/app/assessments/${player.id}`}
                          className="text-sm font-medium underline underline-offset-2"
                        >
                          {t("openHistory")}
                        </Link>
                        <Link
                          href={`/app/assessments/${player.id}/new`}
                          className={primaryButtonClassName}
                        >
                          {t("create")}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("parentListTitle")}
          </h2>
          {parentPlayers.length === 0 ? (
            <EmptyState title={t("parentEmptyTitle")} body={t("parentEmptyBody")} />
          ) : (
            <ul className="grid gap-3">
              {parentPlayers.map((player) => {
                const assessment = latest.get(player.id);
                return (
                  <li
                    key={player.id}
                    className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <span className="font-semibold">
                      {localizedPlayerName(player, locale)}
                    </span>
                    {assessment ? (
                      <AssessmentSummary assessment={assessment} />
                    ) : (
                      <p className="text-sm text-zinc-500">{t("noLatest")}</p>
                    )}
                    <Link
                      href={`/app/assessments/${player.id}`}
                      className="text-sm font-medium underline underline-offset-2"
                    >
                      {t("openHistory")}
                    </Link>
                  </li>
                );
              })}
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
