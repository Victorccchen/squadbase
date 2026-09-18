import { redirect } from "@/i18n/navigation";

type AdminTorneopalRedirectProps = {
  params: Promise<{ locale: string }>;
};

export default async function AdminTorneopalRedirect({ params }: AdminTorneopalRedirectProps) {
  const { locale } = await params;
  redirect({ href: "/app/admin/import", locale });
}
