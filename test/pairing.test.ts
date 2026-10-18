import { describe, expect, it } from "vitest";
import { DeviceKey } from "../src/crypto/deviceKey.js";
import { decodePairedContainer, decodeRegisterPhoneRelayResponse, encodeRegisterPhoneRelay, qrUrl } from "../src/protocol/pairing.js";
import { PbWriter, decode, getBytes, getMessage, getString, getVarint } from "../src/protocol/protobuf.js";

const browser = { userAgent: "ua", browserType: 1, os: "Linux" as const };

describe("RegisterPhoneRelay", () => {
  it("lays out auth header, browser details and key data", () => {
    const spki = DeviceKey.generate().spki();
    const f = decode(encodeRegisterPhoneRelay({ browser, spkiDer: spki, requestId: "rid" }));
    const auth = getMessage(f, 1)!;
    expect(getString(auth, 1)).toBe("rid");
    expect(getString(auth, 3)).toBe("Bugle");
    const b = getMessage(f, 3)!;
    expect(getString(b, 3)).toBe("Linux");
    expect(getVarint(b, 5)).toBe(0n);
    expect(getVarint(b, 6)).toBe(1n);
    const key = getMessage(getMessage(f, 4)!, 6)!; // [B@723205]
    expect(getVarint(key, 1)).toBe(2n);
    expect(spki.length).toBe(91); // A-002: P-256 SPKI DER is 91 bytes
    expect(Buffer.from(spki.subarray(0, 13)).toString("hex")).toBe("3059301306072a8648ce3d0201");
    expect(Buffer.from(getBytes(key, 2)!).equals(Buffer.from(spki))).toBe(true);
  });

  it("decodes pairing key and token", () => {
    const resp = new PbWriter()
      .bytes(3, new Uint8Array([9, 9]))
      .message(5, new PbWriter().bytes(1, new Uint8Array([7])).varint(2, 86400000000n))
      .finish();
    const r = decodeRegisterPhoneRelayResponse(resp);
    expect([...r.pairingKey]).toEqual([9, 9]);
    expect(r.token.ttlMicros).toBe(86400000000n);
  });
});

describe("QR payload", () => {
  it("encodes {1: pairingKey, 2: aes, 3: hmac} after #?c=", () => {
    const url = qrUrl(new Uint8Array([1]), new Uint8Array(32).fill(2), new Uint8Array(32).fill(3));
    const [base, c] = url.split("#?c=");
    expect(base).toBe("https://support.google.com/messages/?p=web_computer");
    const f = decode(new Uint8Array(Buffer.from(c!, "base64")));
    expect([...getBytes(f, 1)!]).toEqual([1]);
    expect(getBytes(f, 2)!.length).toBe(32);
    expect(getBytes(f, 3)![0]).toBe(3);
  });
});

describe("paired container (route 14)", () => {
  it("extracts phone, token and browser identities from f4", () => {
    const id = (t: number, s: string) => new PbWriter().varint(1, t).string(2, s).string(3, "Bugle");
    const paired = new PbWriter()
      .message(1, id(1, "phone-source-id-0001"))
      .message(2, new PbWriter().bytes(1, new Uint8Array([5])).varint(2, 1000n))
      .message(3, id(16, "browser-source-id-01"));
    const p = decodePairedContainer(new PbWriter().message(4, paired).finish())!;
    expect(p.phone.sourceId).toBe("phone-source-id-0001");
    expect(p.browser.type).toBe(16);
    expect(p.token.ttlMicros).toBe(1000n);
  });

  it("returns undefined when f4 is absent", () => {
    expect(decodePairedContainer(new PbWriter().varint(1, 1).finish())).toBeUndefined();
  });
});
