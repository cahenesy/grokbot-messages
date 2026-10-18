import { describe, expect, it } from "vitest";
import { apiKeyProvider, fetchApiKey, getConst, parseMwConfig, unescapeJsString } from "../src/transport/pageConfig.js";
import { SpecGapError } from "../src/protocol/specGaps.js";

// Synthetic page mirroring the documented structure; values are fake.
const config = ["20261015", "build-label", [["flagA", 1]], [[["zJhPad", [null, null, "other"]], ["A16fYe", [null, null, "test-not-a-real-key"]], ["anInt", [null, 42]]]], null, null, null, null, null, null, null, null];
const escaped = JSON.stringify(config).replace(/\[/g, "\\x5b").replace(/\]/g, "\\x5d").replace(/"/g, "\\x22").replace(/\//g, "\\/");
const html = `<html><script nonce="n">window.IS_LOADED_FROM_CACHE=false;window.MW_CONFIG = '${escaped}';</script></html>`;

describe("page config (A-003 follow-up)", () => {
  it("unescapes JS string escapes", () => {
    expect(unescapeJsString("\\x5b\\x22a\\/b\\x22\\x5d \\u00e9 \\u{1F600} \\'")).toBe('["a/b"] é 😀 \'');
  });

  it("finds string and int consts by name", () => {
    const c = parseMwConfig(html);
    expect(c.length).toBe(12);
    expect(getConst(c, "A16fYe")).toBe("test-not-a-real-key");
    expect(getConst(c, "anInt")).toBe(42);
    expect(getConst(c, "missing")).toBeUndefined();
  });

  it("fetches without cookies and fails closed with Q-003", async () => {
    let sentCookie: string | null = "unset";
    const ok = (async (_u: string, init: RequestInit) => {
      sentCookie = new Headers(init.headers).get("cookie");
      return new Response(html, { status: 200 });
    }) as unknown as typeof fetch;
    expect(await fetchApiKey(ok)).toBe("test-not-a-real-key");
    expect(sentCookie).toBeNull();
    const bad = (async () => new Response("<html></html>", { status: 200 })) as unknown as typeof fetch;
    await expect(fetchApiKey(bad)).rejects.toBeInstanceOf(SpecGapError);
  });

  it("prefers the env override", async () => {
    const never = (async () => { throw new Error("should not fetch"); }) as unknown as typeof fetch;
    expect(await apiKeyProvider(() => "override", never)()).toBe("override");
  });
});
