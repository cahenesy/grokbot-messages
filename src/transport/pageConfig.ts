// Runtime read of the web client's page config (A-003 follow-up on #3).
// The page has an inline script `window.MW_CONFIG = '<JS string>';`. Unescaped, it is JSON: a JSPB
// array whose [3][0] is the consts list of [name, valueMsg], where valueMsg is [null, <int>] or
// [null, null, "<string>"]. Search by name; positions are not stable across builds.
// Never log const values (the official client does; we must not).

import { SpecGapError } from "../protocol/specGaps.js";

export const MESSAGES_WEB_PAGE = "https://messages.google.com/web/authentication";
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

/** Fetches the public page (no cookies) and returns the API key, or throws SpecGapError("Q-003"). */
export async function fetchApiKey(fetchImpl: typeof fetch = fetch): Promise<string> {
  try {
    const res = await fetchImpl(MESSAGES_WEB_PAGE, { headers: { Accept: "text/html" }, redirect: "follow" });
    if (res.ok) {
      const key = getConst(parseMwConfig(await res.text()), API_KEY_CONST);
      if (typeof key === "string" && key) return key;
    }
  } catch {
    // fall through: fail closed below, without echoing page content
  }
  throw new SpecGapError("Q-003");
}

/** Env override first, then a cached runtime read. */
export function apiKeyProvider(override: () => string | undefined, fetchImpl?: typeof fetch): () => Promise<string> {
  let cached: Promise<string> | undefined;
  return async () => {
    const o = override();
    if (o) return o;
    cached ??= fetchApiKey(fetchImpl).catch((e) => {
      cached = undefined;
      throw e;
    });
    return cached;
  };
}
