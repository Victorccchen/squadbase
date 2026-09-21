import { cache } from "react";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";

/**
 * Admin layout AccessDenied is not enough: Next.js still renders the page RSC.
 * Call this at the top of every admin page, before any org query.
 * Cached per request so layout + page share one account load.
 */
export const canRenderAdminPage = cache(async (): Promise<boolean> => {
  const { roles } = await loadSignedInAccount();
  return canAccessAdmin(roles);
});
