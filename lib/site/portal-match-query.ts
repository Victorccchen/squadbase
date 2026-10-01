import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { getPublicSupabaseEnv } from "@/lib/env";
import { selectPortalMatches } from "@/lib/site/portal-matches";
import type { Database, PublishedMatch } from "@/lib/supabase/database.types";

/** Shared public list. Short enough that a new publish shows up quickly. */
export const PORTAL_MATCH_REVALIDATE_SECONDS = 60;

/**
 * Same anon RPC as `listPublishedMatches` (`list_published_matches`).
 * No cookies and no user session, so the cache cannot include unpublished
 * rows or anything the RPC does not already return to anonymous visitors.
 */
async function fetchPublishedMatches(): Promise<PublishedMatch[]> {
  const { url, anonKey, isConfigured } = getPublicSupabaseEnv();
  if (!isConfigured) {
    return [];
  }

  const supabase = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await supabase.rpc("list_published_matches");
  if (error) {
    console.error("portal list_published_matches", error.message);
    return [];
  }
  return data ?? [];
}

const loadPublishedMatches = unstable_cache(fetchPublishedMatches, ["portal-published-matches"], {
  revalidate: PORTAL_MATCH_REVALIDATE_SECONDS,
});

export async function listPortalMatchHighlights(now = new Date()) {
  const matches = await loadPublishedMatches();
  return selectPortalMatches(matches, now.getTime());
}
