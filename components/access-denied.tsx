import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function AccessDenied() {
  const t = await getTranslations("access");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{t("deniedTitle")}</h1>
      <p className="text-base leading-7 text-zinc-600 dark:text-zinc-300">
        {t("deniedBody")}
      </p>
      <p>
        <Link href="/app" className="text-sm font-medium underline underline-offset-2">
          {t("backToDashboard")}
        </Link>
      </p>
    </main>
  );
}
