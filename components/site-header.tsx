import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { signOut } from "@/lib/auth/actions";

type SiteHeaderProps = {
  signedIn?: boolean;
  showAuthLink?: boolean;
};

export async function SiteHeader({
  signedIn = false,
  showAuthLink = true,
}: SiteHeaderProps) {
  const t = await getTranslations("common");

  return (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <Link href="/" className="text-sm font-semibold tracking-wide">
        {t("clubName")}
      </Link>
      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        {signedIn ? (
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {t("signOut")}
            </button>
          </form>
        ) : showAuthLink ? (
          <Link
            href="/login"
            className="rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            {t("signIn")}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
