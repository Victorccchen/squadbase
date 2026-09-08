import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RequestLinkForm } from "@/components/children/request-link-form";
import { CancelLinkForm } from "@/components/children/cancel-link-form";
import { LinkStatusBadge } from "@/components/bindings/link-status-badge";
import { AssessmentSummary } from "@/components/assessments/assessment-summary";
import { PlayerPhotoPanel } from "@/components/players/player-photo-panel";
import { listLatestAssessmentsByPlayerId } from "@/lib/assessments/queries";
import { listActiveTeamsForLink, listOwnGuardianLinks, formatActiveMembershipSummary } from "@/lib/org/queries";
import { signPlayerStoragePaths } from "@/lib/org/player-photo-queries";
import { photoAlertFromSearchParams } from "@/lib/org/player-photos";
import { uniqueApprovedLinksByPlayerId } from "@/lib/org/guardian-links";
import { localizedPlayerName, playerNameList } from "@/lib/org/display-name";
import { canParentCancelLink } from "@/lib/org/parse";
import { ageBandFromBirthDate } from "@/lib/age-band";
import { secondaryButtonClassName } from "@/lib/ui";

type ChildrenPageProps = {
  searchParams: Promise<{ photoAlert?: string | string[]; photoPlayer?: string | string[] }>;
};

export default async function ChildrenPage({ searchParams }: ChildrenPageProps) {
  const t = await getTranslations("children");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const photoAlert = photoAlertFromSearchParams(await searchParams);
  const returnTo = `/${locale}/app/children`;
  const [links, teams] = await Promise.all([
    listOwnGuardianLinks(),
    listActiveTeamsForLink(),
  ]);

  const approved = uniqueApprovedLinksByPlayerId(
    links.filter((link) => link.status === "approved"),
  );
  const requests = links.filter((link) => link.status !== "approved");
  const latestAssessments = await listLatestAssessmentsByPlayerId(
    approved
      .map((link) => link.player?.id)
      .filter((id): id is string => Boolean(id)),
  );
  const signed = await signPlayerStoragePaths(approved.map((link) => link.player?.photo_path));

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-12">
        <PageHeader
          title={t("title")}
          description={t("lead")}
          actions={
            <span className="flex flex-wrap gap-2">
              <Link href="/app/sessions" className={secondaryButtonClassName}>
                {t("openSessions")}
              </Link>
              <Link href="/app/competitions" className={secondaryButtonClassName}>
                {t("openCompetitions")}
              </Link>
            </span>
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
                const latest = latestAssessments.get(player.id);
                return (
                  <li
                    key={link.id}
                    className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <span className="font-semibold">
                      {localizedPlayerName(player, locale)}
                    </span>
                    <span className="text-sm text-zinc-500">
                      {playerNameList(player)}
                    </span>
                    <span className="text-sm text-zinc-500">
                      {formatActiveMembershipSummary(player.memberships) ?? org("noTeam")}
                      {" · "}
                      {player.birth_date}
                      {band ? ` · ${org(`ageBands.${band}`)}` : ""}
                      {` · ${t(`relations.${link.relation}`)}`}
                    </span>
                    {latest ? (
                      <AssessmentSummary assessment={latest} />
                    ) : (
                      <p className="mt-2 text-sm text-zinc-500">{t("noAssessment")}</p>
                    )}
                    <PlayerPhotoPanel
                      playerId={player.id}
                      photoPath={player.photo_path}
                      idPdfPath={player.id_pdf_path}
                      signedUrl={
                        player.photo_path ? (signed.get(player.photo_path) ?? null) : null
                      }
                      canWrite
                      returnTo={returnTo}
                      alertErrorKey={
                        photoAlert && (!photoAlert.playerId || photoAlert.playerId === player.id)
                          ? photoAlert.errorKey
                          : null
                      }
                    />
                    <Link href="/app/credits" className="mt-2 text-sm font-medium underline underline-offset-2">
                      {t("openCredits")}
                    </Link>
                    <Link
                      href={`/app/assessments/${player.id}`}
                      className="text-sm font-medium underline underline-offset-2"
                    >
                      {t("openAssessments")}
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
