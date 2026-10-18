import { describe, expect, it } from "vitest";
import { SignInGaiaMode, decodeLookupResponse, decodeSignInResponse, encodeSignInGaia } from "../src/protocol/signInGaia.js";

const b64 = (s: string) => Buffer.from(s).toString("base64");
const id36 = "0123456789abcdef0123456789abcdef0123"; // fixture, 36 chars

describe("SignInGaia (A-013 part 1)", () => {
  it("lookup request: f1 auth GDitto, f2 device {f1}, f3 = 1, f4 GDitto", () => {
    const r = encodeSignInGaia({ auth: { requestId: "r" }, mode: SignInGaiaMode.LOOKUP, deviceId: new Uint8Array(33) });
    expect((r[0] as unknown[])[2]).toBe("GDitto");
    expect((r[1] as unknown[])[0]).toBe(Buffer.alloc(33).toString("base64"));
    expect(r[2]).toBe(1);
    expect(r[3]).toBe("GDitto");
  });

  it("sign-in request omits mode 0 and places f36 / f39 inside the device message", () => {
    const r = encodeSignInGaia({ auth: { requestId: "r" }, mode: SignInGaiaMode.SIGN_IN, deviceId: new Uint8Array(1), f36: new Uint8Array(36), antiAbuseToken: new Uint8Array(2) });
    expect(r[2]).toBeNull();
    const device = r[1] as unknown[];
    expect(device.length).toBe(39);
    expect(device[35]).toBe(Buffer.alloc(36).toString("base64"));
    expect(device[38]).toBe("AAA=");
  });

  it("decodes the lookup list (entry f1 as UTF-8) and an empty response", () => {
    expect(decodeLookupResponse([null, null, [[b64(id36)], [b64("other")]]])).toEqual([id36, "other"]);
    expect(decodeLookupResponse([])).toEqual([]);
  });

  it("decodes sign-in f2 text and f4 token", () => {
    const r = decodeSignInResponse([null, b64(id36), null, ["AQI=", "86400000000"]]);
    expect(r.id).toBe(id36);
    expect(r.token.ttlMicros).toBe(86400000000n);
    expect([...r.token.token]).toEqual([1, 2]);
  });
});
