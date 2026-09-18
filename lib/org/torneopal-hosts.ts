/**
 * Torneopal host helper. Stage L3 fetch allows any public http(s) URL;
 * this remains for the HTML fast-path detector and roster tooling.
 */

export function isTorneopalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "").replace(/^\[|\]$/g, "");
  if (!host) {
    return false;
  }
  return (
    host === "torneopal.com" ||
    host.endsWith(".torneopal.com") ||
    host === "torneopal.fi" ||
    host.endsWith(".torneopal.fi")
  );
}

export const SCHEDULE_FETCH_USER_AGENT =
  "Mozilla/5.0 (compatible; squadbase-schedule-import/1.0; +https://github.com/Victorccchen/squadbase)";

export const TORNEOPAL_FETCH_USER_AGENT = SCHEDULE_FETCH_USER_AGENT;
