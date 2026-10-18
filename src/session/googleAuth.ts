// Google web-session auth for Google-account (GDitto) calls, per spec answer A-012 (#14):
// cookie sources [B@311997–312100], header composition [B@312700–313300], hash [B@298938],
// origin rule [B@298200]. Cookies are secrets: never log them or put them in errors.

import { createHash } from "node:crypto";

export class GoogleSessionError extends Error {
  constructor() {
    // Fixed text only (A-012 "fail closed"): never echo cookie names or values.
    super("Google session expired, please supply fresh cookies");
    this.name = "GoogleSessionError";
  }
}

/** Parses a `Cookie:`-header-style string ("a=1; b=2"). Values are kept verbatim. */
export function parseCookieHeader(s: string): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of s.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return jar;
}

export const serializeCookies = (jar: Map<string, string>): string => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

/**
 * Origin per [B@298200]: lowercase scheme://host, drop path/query/fragment, keep the port only if
 * not the default. For the official client this is https://messages.google.com (INFERRED, A-012).
 */
export function originOf(url: string): string {
  const u = new URL(url);
  const defaultPort = (u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80");
  return `${u.protocol}//${u.hostname.toLowerCase()}${u.port && !defaultPort ? `:${u.port}` : ""}`;
}

export const MESSAGES_ORIGIN = originOf("https://messages.google.com/web/");

/** Lowercase hex SHA-1 over space-joined parts [B@298938]. */
function sha1Hex(parts: string[]): string {
  return createHash("sha1").update(parts.join(" ")).digest("hex");
}

export type HashBranch = "timestamped" | "untimestamped"; // which one relay calls use is UNVERIFIED (A-012)

/** One `<SCHEME> <value>` item. Timestamped value = `<unix s>_<hex>` over `<unix s> <cookie> <origin>`. */
export function hashValue(cookie: string, origin: string, branch: HashBranch, nowSec: number): string {
  if (branch === "untimestamped") return sha1Hex([cookie, origin]);
  return `${nowSec}_${sha1Hex([String(nowSec), cookie, origin])}`;
}

/**
 * Authorization header for an https origin: up to three space-separated items,
 * SAPISIDHASH (SAPISID → APISID → __Secure-3PAPISID), SAPISID1PHASH (__Secure-1PAPISID),
 * SAPISID3PHASH (__Secure-3PAPISID). Returns undefined when no source cookie is present.
 */
export function authorizationHeader(jar: Map<string, string>, origin: string, branch: HashBranch, nowSec = Math.floor(Date.now() / 1000)): string | undefined {
  const items: string[] = [];
  const primary = jar.get("SAPISID") ?? jar.get("APISID") ?? jar.get("__Secure-3PAPISID");
  if (primary) items.push(`SAPISIDHASH ${hashValue(primary, origin, branch, nowSec)}`);
  const p1 = jar.get("__Secure-1PAPISID");
  if (p1) items.push(`SAPISID1PHASH ${hashValue(p1, origin, branch, nowSec)}`);
  const p3 = jar.get("__Secure-3PAPISID");
  if (p3) items.push(`SAPISID3PHASH ${hashValue(p3, origin, branch, nowSec)}`);
  return items.length ? items.join(" ") : undefined;
}

export interface GaiaHeadersInput {
  jar: Map<string, string>;
  branch: HashBranch;
  origin?: string;
  nowSec?: number;
}

/** Cookie-mode headers for clients6 calls (§3, A-012): Authorization, Cookie, X-Goog-AuthUser 0, Origin. */
export function gaiaHeaders(i: GaiaHeadersInput): Record<string, string> {
  const origin = i.origin ?? MESSAGES_ORIGIN;
  const auth = authorizationHeader(i.jar, origin, i.branch, i.nowSec);
  if (!auth) throw new GoogleSessionError();
  return {
    Authorization: auth,
    Cookie: serializeCookies(i.jar),
    "X-Goog-AuthUser": "0", // VERIFIED-LIVE value 0 (A-012)
    Origin: origin,
  };
}

/** Folds Set-Cookie updates from a response into the jar (A-012: persist refreshed values). */
export function applySetCookie(jar: Map<string, string>, setCookie: string[]): boolean {
  let changed = false;
  for (const line of setCookie) {
    const first = line.split(";", 1)[0] ?? "";
    const i = first.indexOf("=");
    if (i <= 0) continue;
    const k = first.slice(0, i).trim();
    const v = first.slice(i + 1).trim();
    if (jar.get(k) !== v) {
      jar.set(k, v);
      changed = true;
    }
  }
  return changed;
}
