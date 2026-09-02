import { getTranslations } from "next-intl/server";
import { PhoneOtpForm } from "@/components/phone-otp-form";
import { SiteHeader } from "@/components/site-header";
import { getPublicSupabaseEnv } from "@/lib/env";
import { safeAppNext } from "@/lib/auth/paths";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const t = await getTranslations("auth");
  const common = await getTranslations("common");
  const params = await searchParams;
  const supabase = getPublicSupabaseEnv();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <SiteHeader showAuthLink={false} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-6 py-12">
        <section className="flex flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-zinc-500">
            {t("eyebrow")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-300">
            {t("lead")}
          </p>
        </section>
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <PhoneOtpForm
            nextPath={safeAppNext(params.next)}
            supabaseConfigured={supabase.isConfigured}
          />
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </div>
  );
}
