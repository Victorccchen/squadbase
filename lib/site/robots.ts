import type { MetadataRoute } from "next";

/**
 * Squadbase is the logged-in operations app; the official site is the public
 * face (spec v4 §11.1). Keep the app area and login out of search results.
 * Public pages (home, /matches) stay crawlable.
 */
export const NO_INDEX_ROBOTS = { index: false, follow: false } as const;

export const ROBOTS_DISALLOW = ["/*/app/", "/*/app$", "/*/login", "/api/"] as const;

export function buildRobots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...ROBOTS_DISALLOW],
    },
  };
}
