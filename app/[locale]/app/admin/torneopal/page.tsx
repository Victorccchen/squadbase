import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { AdminTorneopalPanel } from "@/components/admin/admin-torneopal-panel";
import { canRenderAdminPage } from "@/lib/auth/admin-page";

type AdminTorneopalPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AdminTorneopalPage({ params }: AdminTorneopalPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const { locale } = await params;
  // Pass locale explicitly so post-action RSC re-render does not call
  // next/root-params (forbidden while Next still marks the request as an action).
  const t = await getTranslations({ locale, namespace: "admin" });
  const common = await getTranslations({ locale, namespace: "common" });

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("torneopalTitle")} description={t("torneopalBody")} />
        <AdminTorneopalPanel />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
