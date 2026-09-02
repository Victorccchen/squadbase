import { AccessDenied } from "@/components/access-denied";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";

type AdminLayoutProps = {
  children: React.ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const { roles } = await loadSignedInAccount();

  // Hides the admin subnav. Page RSCs still run in parallel, so each admin
  // page must also call canRenderAdminPage() before any org query.
  if (!canAccessAdmin(roles)) {
    return <AccessDenied area="admin" />;
  }

  return (
    <>
      <div className="border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto w-full max-w-5xl">
          <AdminSubnav />
        </div>
      </div>
      {children}
    </>
  );
}
