import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PushOptIn } from "@/components/settings/push-opt-in";
import { loadSignedInAccount } from "@/lib/auth/session";
import { getVapidPublicKey } from "@/lib/push/env";
import { listOwnPushSubscriptions } from "@/lib/push/queries";

export default async function SettingsPage() {
  await loadSignedInAccount();
  const [t, common, subscriptions] = await Promise.all([
    getTranslations("settings"),
    getTranslations("common"),
    listOwnPushSubscriptions(),
  ]);
  const initiallyEnabled = subscriptions.some((row) => row.enabled);

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("title")} description={t("lead")} />
        <PushOptIn initiallyEnabled={initiallyEnabled} vapidPublicKey={getVapidPublicKey()} />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
