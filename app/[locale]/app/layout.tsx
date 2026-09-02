import { SiteHeader } from "@/components/site-header";
import { AppNav } from "@/components/app-nav";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin, canAccessRoster } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

type AppLayoutProps = {
  children: React.ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const { roles } = await loadSignedInAccount();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <SiteHeader signedIn />
      <AppNav isAdmin={canAccessAdmin(roles)} canRoster={canAccessRoster(roles)} />
      {children}
    </div>
  );
}
