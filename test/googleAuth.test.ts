import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { GoogleSessionError, applySetCookie, authorizationHeader, gaiaHeaders, originOf, parseCookieHeader } from "../src/session/googleAuth.js";

// Fixture values only — not real cookies.
const jar = parseCookieHeader("SID=fake-sid; SAPISID=fake-sapisid; __Secure-1PAPISID=fake-1p; __Secure-3PAPISID=fake-3p");
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

describe("origin rule", () => {
  it("lowercases, strips path, drops default port", () => {
    expect(originOf("https://Messages.Google.com:443/web/conversations?x=1#y")).toBe("https://messages.google.com");
    expect(originOf("https://example.com:8443/a")).toBe("https://example.com:8443");
  });
});

describe("SAPISIDHASH", () => {
  it("timestamped branch: <ts>_sha1('<ts> <cookie> <origin>')", () => {
    const h = authorizationHeader(jar, "https://messages.google.com", "timestamped", 1700000000)!;
    const items = h.split(" ");
    expect(items[0]).toBe("SAPISIDHASH");
    expect(items[1]).toBe(`1700000000_${sha1("1700000000 fake-sapisid https://messages.google.com")}`);
    expect(items[2]).toBe("SAPISID1PHASH");
    expect(items[4]).toBe("SAPISID3PHASH");
  });

  it("untimestamped branch: sha1('<cookie> <origin>')", () => {
    const h = authorizationHeader(new Map([["SAPISID", "v"]]), "https://o", "untimestamped")!;
    expect(h).toBe(`SAPISIDHASH ${sha1("v https://o")}`);
  });

  it("falls back APISID then __Secure-3PAPISID for the primary item", () => {
    expect(authorizationHeader(new Map([["APISID", "a"]]), "https://o", "untimestamped")).toBe(`SAPISIDHASH ${sha1("a https://o")}`);
  });

  it("fails closed with a fixed message when no source cookie exists", () => {
    try {
      gaiaHeaders({ jar: new Map([["SID", "secret-value"]]), branch: "timestamped" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(GoogleSessionError);
      expect(String(e)).not.toContain("secret-value");
    }
  });

  it("sets AuthUser 0 and Origin", () => {
    const h = gaiaHeaders({ jar, branch: "timestamped", nowSec: 1 });
    expect(h["X-Goog-AuthUser"]).toBe("0");
    expect(h.Origin).toBe("https://messages.google.com");
  });
});

describe("Set-Cookie updates", () => {
  it("applies changed values only", () => {
    const j = new Map([["SID", "a"]]);
    expect(applySetCookie(j, ["SID=a; Path=/", "NEW=b; Secure"])).toBe(true);
    expect(j.get("NEW")).toBe("b");
    expect(applySetCookie(j, ["SID=a"])).toBe(false);
  });
});
