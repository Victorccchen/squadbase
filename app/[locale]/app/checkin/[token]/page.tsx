import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";
import { CheckinForm } from "@/components/checkin/checkin-form";
import { loadSignedInAccount } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  childrenAlreadyIn,
  childrenToCheckIn,
  isCheckinToken,
  parseCheckinPreview,
} from "@/lib/checkin/model";
import { localizedPlayerName } from "@/lib/org/display-name";
import { parseAppLocale } from "@/i18n/routing";

type CheckinPageProps = {
  params: Promise<{ token: string }>;
};

/** PR-07 (D11): the counter QR opens this page; sign-in comes first via the /app gate. */
export default async function CheckinPage({ params }: CheckinPageProps) {
  const { token } = await params;
  const locale = await getLocale();
  const { profile } = await loadSignedInAccount();

  // The QR always opens Chinese; switch to the parent's language once known.
  const preferred = profile?.preferred_language;
  if (preferred && preferred !== locale) {
    redirect({ href: `/app/checkin/${token}`, locale: parseAppLocale(preferred) });
  }

  const t = await getTranslations("checkin");
  const common = await getTranslations("common");

  let preview = null;
  if (isCheckinToken(token)) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("checkin_preview", { p_token: token });
    if (error) {
      console.error("checkin_preview", error.message);
    }
    preview = parseCheckinPreview(data);
  }

  const selectable = preview ? childrenToCheckIn(preview) : [];
  const alreadyIn = preview ? childrenAlreadyIn(preview) : [];

  return (
    <>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8">
        <PageHeader title={t("title")} description={preview?.venueName ?? undefined} />
        {!preview ? (
          <p className="rounded-2xl bg-amber-50 p-5 text-base text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            {t("invalidToken")}
          </p>
        ) : preview.sessions.length === 0 ? (
          <p className="rounded-2xl bg-zinc-100 p-5 text-base dark:bg-zinc-800">{t("noSession")}</p>
        ) : (
          <>
            {alreadyIn.length > 0 ? (
              <p className="rounded-2xl bg-emerald-50 p-4 text-base text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50">
                {t("alreadyIn", {
                  names: alreadyIn.map((child) => localizedPlayerName(child.names, locale)).join("、"),
                })}
              </p>
            ) : null}
            {selectable.length === 0 ? (
              alreadyIn.length === 0 ? (
                <p className="rounded-2xl bg-zinc-100 p-5 text-base dark:bg-zinc-800">{t("noChild")}</p>
              ) : null
            ) : (
              <CheckinForm
                token={token}
                locale={locale}
                preview={preview}
                selectablePlayerIds={selectable.map((child) => child.playerId)}
              />
            )}
          </>
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
