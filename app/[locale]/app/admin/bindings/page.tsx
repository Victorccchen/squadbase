import { getLocale, getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { BindingReviewForm } from "@/components/admin/binding-review-form";
import { BindingRevokeForm } from "@/components/admin/binding-revoke-form";
import { LinkStatusBadge } from "@/components/bindings/link-status-badge";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { listGuardianLinksForAdmin } from "@/lib/org/queries";
import { localizedPlayerName, playerNameList } from "@/lib/org/display-name";
import { canAdminRevokeLink } from "@/lib/org/parse";
import type { GuardianLinkWithPlayer } from "@/lib/org/queries";

export default async function AdminBindingsPage() {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const t = await getTranslations("admin");
  const childrenT = await getTranslations("children");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const links = await listGuardianLinksForAdmin();
  const pending = links.filter((link) => link.status === "pending");
  const others = links.filter((link) => link.status !== "pending");

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12">
        <PageHeader title={t("bindingsTitle")} description={t("bindingsBody")} />

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("pendingQueue")}
          </h2>
          {pending.length === 0 ? (
            <EmptyState title={t("bindingsEmptyTitle")} body={t("bindingsEmptyBody")} />
          ) : (
            <ul className="grid gap-4">
              {pending.map((link) => (
                <li key={link.id}>
                  <BindingCard link={link} locale={locale} t={t} childrenT={childrenT} review />
                </li>
              ))}
            </ul>
          )}
        </section>

        {others.length > 0 ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {t("allRequests")}
            </h2>
            <ul className="grid gap-3">
              {others.map((link) => (
                <li key={link.id}>
                  <BindingCard link={link} locale={locale} t={t} childrenT={childrenT} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}

function BindingCard({
  link,
  locale,
  t,
  childrenT,
  review = false,
}: {
  link: GuardianLinkWithPlayer;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
  childrenT: Awaited<ReturnType<typeof getTranslations>>;
  review?: boolean;
}) {
  const player = link.player;
  const guardianLabel =
    link.guardian?.display_name || link.guardian?.phone || link.guardian_user_id;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2">
        <LinkStatusBadge
          status={link.status}
          label={childrenT(`statuses.${link.status}`)}
        />
        <span className="text-sm font-medium">
          {childrenT(`relations.${link.relation}`)}
        </span>
      </div>
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">{t("guardian")}</dt>
          <dd className="font-medium">{guardianLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">{childrenT("player")}</dt>
          <dd className="text-right font-medium">
            {player ? localizedPlayerName(player, locale) : childrenT("noMatchDetails")}
          </dd>
        </div>
        {player ? (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{childrenT("playerNames")}</dt>
              <dd className="text-right text-zinc-600 dark:text-zinc-300">
                {playerNameList(player)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{childrenT("playerTeam")}</dt>
              <dd className="font-medium">
                {player.membership?.team
                  ? `${player.membership.team.name} · #${player.membership.jersey_number}`
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{childrenT("playerBirth")}</dt>
              <dd className="font-medium">{player.birth_date}</dd>
            </div>
          </>
        ) : null}
        {link.parent_note ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{childrenT("parentNote")}</dt>
            <dd className="text-right">{link.parent_note}</dd>
          </div>
        ) : null}
        {link.admin_note ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{childrenT("adminNote")}</dt>
            <dd className="text-right">{link.admin_note}</dd>
          </div>
        ) : null}
      </dl>
      {review ? <BindingReviewForm linkId={link.id} /> : null}
      {!review && canAdminRevokeLink(link.status) ? (
        <BindingRevokeForm linkId={link.id} />
      ) : null}
    </article>
  );
}
