import { SiteHeader } from "@/components/site-header";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getPublicAppEnv, getPublicSupabaseEnv } from "@/lib/env";
import { getAuthUser } from "@/lib/auth/session";

export async function HomeScreen() {
  const t = await getTranslations("home");
  const common = await getTranslations("common");
  const supabase = getPublicSupabaseEnv();
  const appEnv = getPublicAppEnv();
  const user = await getAuthUser();
  const signedIn = Boolean(user);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <SiteHeader signedIn={signedIn} />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
        <section className="flex flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-zinc-500">
            {t("eyebrow")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("headline")}
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-300">
            {t("lead")}
          </p>
          <div className="pt-2">
            <Link
              href={signedIn ? "/app" : "/login"}
              className="inline-flex rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
            >
              {signedIn ? t("openDashboard") : common("signIn")}
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("sampleLabel")}
          </h2>
          <p className="mt-2 text-base leading-7">{t("sampleBody")}</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {t("stackTitle")}
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
              <li>{t("stackNext")}</li>
              <li>{t("stackI18n")}</li>
              <li>{t("stackSupabase")}</li>
              <li>{t("stackPwa")}</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {t("envTitle")}
            </h2>
            <p className="mt-3 text-sm leading-6">
              {supabase.isConfigured ? t("envConfigured") : t("envMissing")}
            </p>
            <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">
              {t("envLabel")}: {appEnv}
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </div>
  );
}
