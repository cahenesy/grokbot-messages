import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { fromFlat, openContainer, openCtrHmac, openGcm, sealCtrHmac, sealGcm, toContainer, toFlat } from "../src/crypto/payload.js";

const keys = { aesKey: new Uint8Array(32).fill(1), hmacKey: new Uint8Array(32).fill(2) };
const iv = new Uint8Array(16).fill(3);
const body = new TextEncoder().encode("test-vector-001");

describe("scheme 2 (AES-256-CTR + HMAC-SHA256)", () => {
  it("tags ciphertext‖IV with the HMAC key", () => {
    const s = sealCtrHmac(keys, body, iv);
    const expected = createHmac("sha256", keys.hmacKey).update(Buffer.concat([s.ciphertext, iv])).digest();
    expect(Buffer.from(s.tag).equals(expected)).toBe(true);
    expect(s.ciphertext.length).toBe(body.length);
  });

  it("round-trips through the flat layout with 48 bytes of overhead", () => {
    const flat = toFlat(sealCtrHmac(keys, body, iv));
    expect(flat.length).toBe(body.length + 48);
    expect(new TextDecoder().decode(openCtrHmac(keys, fromFlat(flat)))).toBe("test-vector-001");
  });

  it("round-trips through the container layout", () => {
    expect(new TextDecoder().decode(openContainer(keys, toContainer(sealCtrHmac(keys, body))))).toBe("test-vector-001");
  });

  it("rejects a tampered ciphertext", () => {
    const flat = toFlat(sealCtrHmac(keys, body, iv));
    flat[0]! ^= 1;
    expect(() => openCtrHmac(keys, fromFlat(flat))).toThrow(/HMAC/);
  });
});

describe("scheme 1 (AES-128-GCM, first 16 key bytes)", () => {
  it("round-trips", () => {
    const { nonce, data } = sealGcm(keys.aesKey, body);
    expect(new TextDecoder().decode(openGcm(keys.aesKey, nonce, data))).toBe("test-vector-001");
  });
});

import { decryptPayload, encryptPayload } from "../src/crypto/payload.js";

describe("wire cipher (A-018 item 5)", () => {
  it("is ct ‖ IV ‖ HMAC(ct ‖ IV) with 48 bytes of overhead, and round-trips (32- and 16-byte AES keys)", () => {
    const w = encryptPayload(keys, body, iv);
    expect(w.length).toBe(body.length + 48);
    expect(Buffer.from(w.subarray(body.length, body.length + 16)).equals(Buffer.from(iv))).toBe(true);
    const tag = createHmac("sha256", keys.hmacKey).update(w.subarray(0, body.length + 16)).digest();
    expect(Buffer.from(w.subarray(body.length + 16)).equals(tag)).toBe(true);
    expect(new TextDecoder().decode(decryptPayload(keys, w))).toBe("test-vector-001");
    const k16 = { aesKey: new Uint8Array(16).fill(4), hmacKey: keys.hmacKey };
    expect(new TextDecoder().decode(decryptPayload(k16, encryptPayload(k16, body)))).toBe("test-vector-001");
  });

  it("passes empty plaintext through unencrypted and rejects short or tampered input", () => {
    expect(encryptPayload(keys, new Uint8Array()).length).toBe(0);
    expect(decryptPayload(keys, new Uint8Array()).length).toBe(0);
    expect(() => decryptPayload(keys, new Uint8Array(47))).toThrow(/48/);
    const w = encryptPayload(keys, body);
    w[0]! ^= 1;
    expect(() => decryptPayload(keys, w)).toThrow(/HMAC/);
  });
});
