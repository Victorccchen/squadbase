/**
 * Payload for the official site's revalidate endpoint (spec v4 system rule 8,
 * 13-C2). Pure helpers; the POST itself lives in revalidate-notify.ts.
 */

export const SITE_REVALIDATE_MAX_TAGS = 20;
export const SITE_REVALIDATE_TIMEOUT_MS = 3000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STATIC_TAGS = new Set([
  "matches",
  "squad",
  "news",
  "standings",
  "partners",
  "clubs",
  "venues",
]);

/** Tags the site accepts: matches, match:<uuid>, squad, player:<uuid>, news, news:<slug>, standings, partners, clubs, venues. */
export function isAllowedSiteTag(tag: string): boolean {
  if (STATIC_TAGS.has(tag)) {
    return true;
  }
  const [prefix, value, ...rest] = tag.split(":");
  if (rest.length > 0 || value === undefined) {
    return false;
  }
  if (prefix === "match" || prefix === "player") {
    return UUID_PATTERN.test(value);
  }
  if (prefix === "news") {
    return SLUG_PATTERN.test(value);
  }
  return false;
}

/** Dedupes, lowercases ids, drops tags the site would reject, caps at 20. */
export function normalizeSiteTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/^(match|player):(.+)$/i, (_m, p: string, v: string) => `${p.toLowerCase()}:${v.toLowerCase()}`);
    if (!isAllowedSiteTag(tag) || out.includes(tag)) {
      continue;
    }
    out.push(tag);
    if (out.length >= SITE_REVALIDATE_MAX_TAGS) {
      break;
    }
  }
  return out;
}

/** Tags for a change to one or more matches. Roster changes also bust "squad". */
export function matchRevalidateTags(
  matchIds: readonly string[],
  options: { roster?: boolean } = {},
): string[] {
  return normalizeSiteTags([
    "matches",
    ...matchIds.map((id) => `match:${id}`),
    ...(options.roster ? ["squad"] : []),
  ]);
}

export type SiteRevalidateRequest = {
  url: string;
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  };
};

/**
 * Builds the POST request, or null when the env is not set (skip silently)
 * or no allowed tag remains.
 */
export function buildSiteRevalidateRequest(input: {
  url: string | undefined;
  secret: string | undefined;
  tags: readonly string[];
}): SiteRevalidateRequest | null {
  const url = input.url?.trim() ?? "";
  const secret = input.secret?.trim() ?? "";
  if (!url || !secret) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  const tags = normalizeSiteTags(input.tags);
  if (tags.length === 0) {
    return null;
  }
  return {
    url: parsed.toString(),
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tags }),
    },
  };
}
