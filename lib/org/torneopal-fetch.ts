/**
 * Stage L3: fetch public schedule HTML. SSRF still applies on every hop.
 * Product URLs are not limited to Torneopal hosts.
 */

import { SCHEDULE_FETCH_USER_AGENT } from "./torneopal-hosts.ts";
import {
  fetchPublicHtml,
  type FetchPublicHtmlDeps,
  type FetchPublicHtmlResult,
} from "./url-ssrf.ts";

export async function fetchScheduleHtml(
  rawUrl: string,
  deps: FetchPublicHtmlDeps = {},
): Promise<FetchPublicHtmlResult> {
  return fetchPublicHtml(rawUrl, {
    ...deps,
    userAgent: deps.userAgent ?? SCHEDULE_FETCH_USER_AGENT,
  });
}

/** Stage L alias. Fetch policy is the generic public-HTML path. */
export const fetchTorneopalHtml = fetchScheduleHtml;
