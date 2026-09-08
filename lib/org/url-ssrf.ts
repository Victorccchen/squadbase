/**
 * SSRF guards for Stage 6A match URL assist.
 * http/https only; block private/link-local/metadata IPs; caller enforces timeout/size.
 */

import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import type { OrgErrorKey } from "./errors.ts";

export const URL_ASSIST_TIMEOUT_MS = 8000;
export const URL_ASSIST_MAX_BODY_BYTES = 1_000_000;
export const URL_ASSIST_MAX_REDIRECTS = 3;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "internal",
]);

function ipv4FromMapped(ip: string): string | null {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  return mapped?.[1] ?? null;
}

function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return nums as [number, number, number, number];
}

function decimalHostToIpv4(host: string): string | null {
  if (!/^\d+$/.test(host)) {
    return null;
  }
  const n = Number(host);
  if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) {
    return null;
  }
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

export function isBlockedIpv4(ip: string): boolean {
  const parts = parseIpv4(ip);
  if (!parts) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 127 || a === 10 || a >= 224) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return true;
  }
  return false;
}

export function isBlockedIpv6(ip: string): boolean {
  const mapped = ipv4FromMapped(ip);
  if (mapped) {
    return isBlockedIpv4(mapped);
  }
  const compact = ip.toLowerCase();
  if (compact === "::1" || compact === "::") {
    return true;
  }
  // Unique local fc00::/7, link-local fe80::/10
  if (compact.startsWith("fc") || compact.startsWith("fd") || compact.startsWith("fe8") || compact.startsWith("fe9") || compact.startsWith("fea") || compact.startsWith("feb")) {
    return true;
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    return isBlockedIpv4(ip);
  }
  if (kind === 6) {
    return isBlockedIpv6(ip);
  }
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (!host) {
    return true;
  }
  if (BLOCKED_HOSTS.has(host)) {
    return true;
  }
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (host.includes("metadata.google.internal")) {
    return true;
  }
  return false;
}

export type SafeUrlResult =
  | { ok: true; url: URL }
  | { ok: false; errorKey: Extract<OrgErrorKey, "blockedUrl"> };

export function assertSafePublicUrl(raw: string): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, errorKey: "blockedUrl" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, errorKey: "blockedUrl" };
  }
  if (url.username || url.password) {
    return { ok: false, errorKey: "blockedUrl" };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(host)) {
    return { ok: false, errorKey: "blockedUrl" };
  }
  const decimal = decimalHostToIpv4(host);
  if (decimal && isBlockedIpv4(decimal)) {
    return { ok: false, errorKey: "blockedUrl" };
  }
  if (isIP(host) && isBlockedIp(host)) {
    return { ok: false, errorKey: "blockedUrl" };
  }
  return { ok: true, url };
}

export type LookupFn = (hostname: string) => Promise<{ address: string; family: number }[]>;

export async function resolvePublicAddresses(
  hostname: string,
  lookup: LookupFn = defaultLookup,
): Promise<{ ok: true; addresses: string[] } | { ok: false; errorKey: "blockedUrl" }> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isBlockedIp(host)) {
      return { ok: false, errorKey: "blockedUrl" };
    }
    return { ok: true, addresses: [host] };
  }
  const decimal = decimalHostToIpv4(host);
  if (decimal) {
    if (isBlockedIpv4(decimal)) {
      return { ok: false, errorKey: "blockedUrl" };
    }
    return { ok: true, addresses: [decimal] };
  }
  try {
    const records = await lookup(host);
    const addresses = records.map((row) => row.address);
    if (addresses.length === 0 || addresses.some((ip) => isBlockedIp(ip))) {
      return { ok: false, errorKey: "blockedUrl" };
    }
    return { ok: true, addresses };
  } catch {
    return { ok: false, errorKey: "blockedUrl" };
  }
}

async function defaultLookup(hostname: string): Promise<{ address: string; family: number }[]> {
  const rows = await dnsLookup(hostname, { all: true });
  return rows.map((row) => ({ address: row.address, family: row.family }));
}

export type FetchPublicHtmlDeps = {
  lookup?: LookupFn;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

export type FetchPublicHtmlResult =
  | { ok: true; url: string; html: string }
  | { ok: false; errorKey: Extract<OrgErrorKey, "blockedUrl" | "urlFetchFailed" | "urlTimeout"> };

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; errorKey: "urlFetchFailed" }> {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxBytes) {
      return { ok: false, errorKey: "urlFetchFailed" };
    }
    return { ok: true, text };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return { ok: false, errorKey: "urlFetchFailed" };
    }
    chunks.push(value);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder("utf-8").decode(out) };
}

export async function fetchPublicHtml(
  rawUrl: string,
  deps: FetchPublicHtmlDeps = {},
): Promise<FetchPublicHtmlResult> {
  const timeoutMs = deps.timeoutMs ?? URL_ASSIST_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? URL_ASSIST_MAX_BODY_BYTES;
  const maxRedirects = deps.maxRedirects ?? URL_ASSIST_MAX_REDIRECTS;
  const doFetch = deps.fetch ?? fetch;
  const lookup = deps.lookup;

  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const parsed = assertSafePublicUrl(current);
    if (!parsed.ok) {
      return parsed;
    }
    const resolved = await resolvePublicAddresses(parsed.url.hostname, lookup ?? defaultLookup);
    if (!resolved.ok) {
      return resolved;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(parsed.url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "User-Agent": "squadbase-url-assist/1.0",
        },
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, errorKey: "urlTimeout" };
      }
      return { ok: false, errorKey: "urlFetchFailed" };
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === maxRedirects) {
        return { ok: false, errorKey: "urlFetchFailed" };
      }
      try {
        current = new URL(location, parsed.url).toString();
      } catch {
        return { ok: false, errorKey: "blockedUrl" };
      }
      continue;
    }

    if (!response.ok) {
      return { ok: false, errorKey: "urlFetchFailed" };
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("text/plain")
    ) {
      return { ok: false, errorKey: "urlFetchFailed" };
    }

    const body = await readLimitedBody(response, maxBytes);
    if (!body.ok) {
      return body;
    }
    return { ok: true, url: parsed.url.toString(), html: body.text };
  }
  return { ok: false, errorKey: "urlFetchFailed" };
}
