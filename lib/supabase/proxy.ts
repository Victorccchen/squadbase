import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getPublicSupabaseEnv } from "@/lib/env";
import {
  isAppPath,
  isLoginPath,
  splitLocalePath,
} from "@/lib/auth/paths";
import type { Database } from "@/lib/supabase/database.types";

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

/**
 * Refresh the Auth session on the next-intl response, then gate /app.
 * Mutates `response` cookies in place so locale rewrites/redirects stay intact.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const { url, anonKey, isConfigured } = getPublicSupabaseEnv();
  let isAuthenticated = false;

  if (isConfigured) {
    const supabase = createServerClient<Database>(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    // Validate the JWT (do not use getSession() here).
    const { data } = await supabase.auth.getClaims();
    isAuthenticated = Boolean(data?.claims?.sub);
  }

  const { locale, rest } = splitLocalePath(request.nextUrl.pathname);

  if (isAppPath(rest) && !isAuthenticated) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}/login`;
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", rest === "/" ? "/app" : rest);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  if (isLoginPath(rest) && isAuthenticated) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}/app`;
    redirectUrl.search = "";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}
