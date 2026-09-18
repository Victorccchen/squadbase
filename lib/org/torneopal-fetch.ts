/**
 * Stage L: allowlisted Torneopal fetch. SSRF still applies on every hop.
 */

import { isTorneopalHostname, TORNEOPAL_FETCH_USER_AGENT } from "./torneopal-hosts.ts";
import {
  assertSafePublicUrl,
  fetchPublicHtml,
  type FetchPublicHtmlDeps,
  type FetchPublicHtmlResult,
} from "./url-ssrf.ts";

export async function fetchTorneopalHtml(
  rawUrl: string,
  deps: FetchPublicHtmlDeps = {},
): Promise<FetchPublicHtmlResult> {
  const parsed = assertSafePublicUrl(rawUrl);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isTorneopalHostname(parsed.url.hostname)) {
    return { ok: false, errorKey: "blockedUrl" };
  }
  return fetchPublicHtml(rawUrl, {
    ...deps,
    isAllowedHostname: (hostname) =>
      isTorneopalHostname(hostname) && (deps.isAllowedHostname?.(hostname) ?? true),
    userAgent: deps.userAgent ?? TORNEOPAL_FETCH_USER_AGENT,
  });
}
