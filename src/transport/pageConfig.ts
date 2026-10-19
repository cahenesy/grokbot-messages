// Runtime read of the web client's page config (A-003 follow-up on #3).
// The page has an inline script `window.MW_CONFIG = '<JS string>';`. Unescaped, it is JSON: a JSPB
// array whose [3][0] is the consts list of [name, valueMsg], where valueMsg is [null, <int>] or
// [null, null, "<string>"]. Search by name; positions are not stable across builds.
// Never log const values (the official client does; we must not).

import { SpecGapError } from "../protocol/specGaps.js";

export const MESSAGES_WEB_PAGE = "https://messages.google.com/web/authentication";

/**
 * Pinned desktop-browser User-Agent for this public, unauthenticated page fetch ONLY. The page returns 400
 * to non-browser UAs and an unsupported-browser page (no MW_CONFIG) to old ones. Approved by the spec team
 * for this fetch only (A-003 part 3, https://github.com/cahenesy/grokbot-messages/issues/3). Relay calls keep
 * the runtime default UA. Override: ${GOOGLE_MESSAGES_PAGE_USER_AGENT}. Update when it goes stale.
 */
export const PAGE_FETCH_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export class PageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageConfigError";
  }
}
/** Page-config const holding the relay API key [B@811680] (A-003). */
export const API_KEY_CONST = "A16fYe";

/** Unescapes a single-quoted JS string literal body (\xHH, \uHHHH, \u{…}, simple escapes). */
export function unescapeJsString(s: string): string {
  return s.replace(/\\(x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|[\s\S])/g, (_, e: string) => {
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e.startsWith("u{")) return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e[0] === "u" && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    const simple: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0" };
    return simple[e] ?? e; // \/ \\ \' \" and unknown escapes → the character itself
  });
}

export function parseMwConfig(html: string): unknown[] {
  const m = /window\.MW_CONFIG\s*=\s*'((?:[^'\\]|\\[\s\S])*)'\s*;/.exec(html);
  if (!m) throw new Error("page config (MW_CONFIG) not found");
  const v = JSON.parse(unescapeJsString(m[1]!)) as unknown;
  if (!Array.isArray(v)) throw new Error("page config is not an array");
  return v;
}

/** Looks up a const by name in [3][0]. Returns a string or number, or undefined if absent. */
export function getConst(config: unknown[], name: string): string | number | undefined {
  const wrapper = config[3];
  const list = Array.isArray(wrapper) ? wrapper[0] : undefined;
  if (!Array.isArray(list)) return undefined;
  for (const e of list) {
    if (!Array.isArray(e) || e[0] !== name || !Array.isArray(e[1])) continue;
    const [, n, str] = e[1] as unknown[];
    if (typeof str === "string") return str;
    if (typeof n === "number") return n;
  }
  return undefined;
}

const STALE_UA_HINT =
  "the page did not include its client config; the pinned browser User-Agent is probably outdated. " +
  "Set GOOGLE_MESSAGES_PAGE_USER_AGENT to a current desktop browser UA, or set GOOGLE_MESSAGES_API_KEY.";

/**
 * Fetches the public page once (no cookies, no retries) and returns the API key. A 400, or a 200 without
 * MW_CONFIG (the unsupported-browser page), fails with an actionable error (A-003 part 3). Never logs values.
 */
export async function fetchApiKey(fetchImpl: typeof fetch = fetch, userAgent: string = PAGE_FETCH_USER_AGENT): Promise<string> {
  return (await fetchPageInfo(fetchImpl, userAgent)).apiKey;
}

export interface PageInfo {
  apiKey: string;
  /** MW_CONFIG[0], an 8-digit YYYYMMDD build string (INFERRED source of BUILD_VERSION, A-021). */
  buildString?: string;
}

export async function fetchPageInfo(fetchImpl: typeof fetch = fetch, userAgent: string = PAGE_FETCH_USER_AGENT): Promise<PageInfo> {
  let res: Response;
  try {
    res = await fetchImpl(MESSAGES_WEB_PAGE, { headers: { "User-Agent": userAgent, Accept: "text/html" }, redirect: "follow" });
  } catch {
    throw new PageConfigError("could not reach messages.google.com to read the client config");
  }
  if (!res.ok) throw new PageConfigError(`HTTP ${res.status} from the Messages web page: ${STALE_UA_HINT}`);
  let config: unknown[];
  try {
    config = parseMwConfig(await res.text());
  } catch {
    throw new PageConfigError(`Messages web page returned no usable config: ${STALE_UA_HINT}`);
  }
  const key = getConst(config, API_KEY_CONST);
  if (typeof key !== "string" || !key) throw new SpecGapError("Q-003"); // config present but the const moved or was renamed
  return { apiKey: key, buildString: typeof config[0] === "string" ? config[0] : undefined };
}

/** Cached runtime page read (one attempt per call; no retry loop). */
export function pageInfoProvider(fetchImpl?: typeof fetch, userAgent?: () => string | undefined): () => Promise<PageInfo> {
  let cached: Promise<PageInfo> | undefined;
  return () => {
    cached ??= fetchPageInfo(fetchImpl, userAgent?.() ?? PAGE_FETCH_USER_AGENT).catch((e) => {
      cached = undefined;
      throw e;
    });
    return cached;
  };
}

/** Env override first, then the page's A16fYe. */
export function apiKeyProvider(override: () => string | undefined, fetchImpl?: typeof fetch, userAgent?: () => string | undefined, page = pageInfoProvider(fetchImpl, userAgent)): () => Promise<string> {
  return async () => override() ?? (await page()).apiKey;
}
