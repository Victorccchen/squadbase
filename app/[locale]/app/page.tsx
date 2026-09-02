import { getTranslations } from "next-intl/server";
import { DashboardPlaceholders } from "@/components/dashboard-placeholders";
import { loadOwnAccount, requireUser } from "@/lib/auth/session";
import { uniqueRoles } from "@/lib/auth/roles";

export default async function AppDashboardPage() {
  const t = await getTranslations("app");
  const common = await getTranslations("common");
  const user = await requireUser();
  const { profile, roles } = await loadOwnAccount(user.id);
  const unique = uniqueRoles(roles);
  const phone = profile?.phone ?? user.phone ?? t("phoneUnknown");

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
        <section className="flex flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-zinc-500">
            {t("eyebrow")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-300">
            {t("welcome")}
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("accountTitle")}
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{t("phoneLabel")}</dt>
              <dd className="font-medium">{phone}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{t("rolesLabel")}</dt>
              <dd className="font-medium">
                {unique.length > 0
                  ? unique.map((role) => t(`roles.${role}`)).join(" · ")
                  : t("rolesEmpty")}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{t("profileLabel")}</dt>
              <dd className="font-medium">
                {profile ? t("profileReady") : t("profileMissing")}
              </dd>
            </div>
          </dl>
        </section>

        <DashboardPlaceholders roles={unique} />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
