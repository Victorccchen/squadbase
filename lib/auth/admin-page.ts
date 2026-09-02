import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";

/**
 * Admin layout AccessDenied is not enough: Next.js still renders the page RSC.
 * Call this at the top of every admin page, before any org query.
 */
export async function canRenderAdminPage(): Promise<boolean> {
  const { roles } = await loadSignedInAccount();
  return canAccessAdmin(roles);
}
