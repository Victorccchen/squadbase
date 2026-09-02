import { requireUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/site-header";

type AppLayoutProps = {
  children: React.ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <SiteHeader signedIn />
      {children}
    </div>
  );
}
