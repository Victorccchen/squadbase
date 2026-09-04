import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RequestLinkForm } from "@/components/children/request-link-form";
import { CancelLinkForm } from "@/components/children/cancel-link-form";
import { LinkStatusBadge } from "@/components/bindings/link-status-badge";
import { listActiveTeamsForLink, listOwnGuardianLinks } from "@/lib/org/queries";
import { uniqueApprovedLinksByPlayerId } from "@/lib/org/guardian-links";
import { localizedPlayerName, playerNameList } from "@/lib/org/display-name";
import { canParentCancelLink } from "@/lib/org/parse";
import { ageBandFromBirthDate } from "@/lib/age-band";
import { secondaryButtonClassName } from "@/lib/ui";

export default async function ChildrenPage() {
  const t = await getTranslations("children");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const [links, teams] = await Promise.all([
    listOwnGuardianLinks(),
    listActiveTeamsForLink(),
  ]);

  const approved = uniqueApprovedLinksByPlayerId(
    links.filter((link) => link.status === "approved"),
  );
  const requests = links.filter((link) => link.status !== "approved");

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
            {t("myChildren")}
          </h2>
          {approved.length === 0 ? (
            <EmptyState title={t("emptyChildrenTitle")} body={t("emptyChildrenBody")} />
          ) : (
            <ul className="grid gap-3">
              {approved.map((link) => {
                const player = link.player;
                if (!player) {
                  return (
                    <li
                      key={link.id}
                      className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      {t("noMatchDetails")}
                    </li>
                  );
                }
                const band = ageBandFromBirthDate(player.birth_date);
                return (
                  <li
                    key={link.id}
                    className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <span className="font-semibold">
                      {localizedPlayerName(player, locale)}
                    </span>
                    <span className="text-sm text-zinc-500">
                      {playerNameList(player)}
                    </span>
                    <span className="text-sm text-zinc-500">
                      {player.membership?.team
                        ? `${player.membership.team.name} · #${player.membership.jersey_number}`
                        : org("noTeam")}
                      {" · "}
                      {player.birth_date}
                      {band ? ` · ${org(`ageBands.${band}`)}` : ""}
                      {` · ${t(`relations.${link.relation}`)}`}
                    </span>
                    <Link href="/app/credits" className="mt-2 text-sm font-medium underline underline-offset-2">
                      {t("openCredits")}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("requests")}
          </h2>
          {requests.length === 0 ? (
            <EmptyState title={t("emptyRequestsTitle")} body={t("emptyRequestsBody")} />
          ) : (
            <ul className="grid gap-3">
              {requests.map((link) => (
                <li
                  key={link.id}
                  className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <LinkStatusBadge
                      status={link.status}
                      label={t(`statuses.${link.status}`)}
                    />
                    <span className="text-sm font-medium">{t(`relations.${link.relation}`)}</span>
                  </div>
                  <p className="text-sm text-zinc-500">
                    {t("requestedAt")}: {link.created_at.slice(0, 10)}
                  </p>
                  {link.parent_note ? (
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {t("parentNote")}: {link.parent_note}
                    </p>
                  ) : null}
                  {(link.status === "rejected" || link.status === "revoked") && link.admin_note ? (
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {t("adminNote")}: {link.admin_note}
                    </p>
                  ) : null}
                  {canParentCancelLink(link.status) ? <CancelLinkForm linkId={link.id} /> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("requestTitle")}
          </h2>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("requestLead")}</p>
          <RequestLinkForm teams={teams} />
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
