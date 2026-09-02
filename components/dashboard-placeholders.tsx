import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppRole } from "@/lib/supabase/database.types";
import { isDashboardRole } from "@/lib/auth/roles";

type DashboardPlaceholdersProps = {
  roles: AppRole[];
};

const PARENT_ITEMS = ["children", "courses"] as const;
const COACH_COMING = ["attendance", "assessments"] as const;

function PlaceholderCard({
  title,
  body,
  comingSoon,
}: {
  title: string;
  body: string;
  comingSoon: string;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {comingSoon}
        </span>
      </div>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{body}</p>
    </article>
  );
}

function LinkCard({
  href,
  title,
  body,
  action,
}: {
  href: "/app/roster" | "/app/admin" | "/app/admin/teams" | "/app/admin/players" | "/app/admin/coaches";
  title: string;
  body: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{body}</p>
      <span className="text-sm font-medium underline underline-offset-2">{action}</span>
    </Link>
  );
}

export async function DashboardPlaceholders({ roles }: DashboardPlaceholdersProps) {
  const t = await getTranslations("app");
  const comingSoon = t("comingSoon");
  const hasParent = roles.includes("parent");
  const hasCoach = roles.includes("coach");
  const hasAdmin = roles.includes("admin");
  const hasPlayer = roles.includes("player");
  const hasDashboardRole = roles.some(isDashboardRole);

  return (
    <div className="flex flex-col gap-10">
      {!hasDashboardRole ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {t("noDashboardRole")}
        </p>
      ) : null}

      {hasParent ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("parentSection")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {PARENT_ITEMS.map((key) => (
              <PlaceholderCard
                key={key}
                title={t(`placeholders.${key}.title`)}
                body={t(`placeholders.${key}.body`)}
                comingSoon={comingSoon}
              />
            ))}
          </div>
        </section>
      ) : null}

      {hasCoach ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("coachSection")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <LinkCard
              href="/app/roster"
              title={t("placeholders.squads.title")}
              body={t("placeholders.squads.body")}
              action={t("openRoster")}
            />
            {COACH_COMING.map((key) => (
              <PlaceholderCard
                key={key}
                title={t(`placeholders.${key}.title`)}
                body={t(`placeholders.${key}.body`)}
                comingSoon={comingSoon}
              />
            ))}
          </div>
        </section>
      ) : null}

      {hasAdmin ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("adminSection")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <LinkCard
              href="/app/admin/teams"
              title={t("placeholders.teams.title")}
              body={t("placeholders.teams.body")}
              action={t("openAdmin")}
            />
            <LinkCard
              href="/app/admin/players"
              title={t("placeholders.players.title")}
              body={t("placeholders.players.body")}
              action={t("openAdmin")}
            />
            <LinkCard
              href="/app/admin/coaches"
              title={t("placeholders.coaches.title")}
              body={t("placeholders.coaches.body")}
              action={t("openAdmin")}
            />
            <PlaceholderCard
              title={t("placeholders.adminNote.title")}
              body={t("placeholders.adminNote.body")}
              comingSoon={comingSoon}
            />
          </div>
        </section>
      ) : null}

      {hasPlayer ? (
        <p className="text-sm text-zinc-500">{t("playerNote")}</p>
      ) : null}
    </div>
  );
}
