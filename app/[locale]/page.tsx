import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PortalHome } from "@/components/portal/portal-home";
import { clubNameForLocale, siteConfig } from "@/lib/site/site-config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.meta" });
  const club = clubNameForLocale(locale);
  const title = t("title", { club });
  const description = t("description");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      locale,
    },
    icons: {
      icon: [{ url: siteConfig.favicon.src, type: "image/png" }],
      apple: [{ url: siteConfig.favicon.src }],
    },
  };
}

export default function HomePage() {
  return <PortalHome />;
}
