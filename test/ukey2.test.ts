import { describe, expect, it } from "vitest";
import { createECDH, createHash, hkdfSync } from "node:crypto";
import {
  D2D_SALT, NEXT_PROTOCOL, P256_SHA512, Ukey2Type, decodeGenericPublicKey, derivePayloadKeys, deriveUkey2Keys, encodeGenericPublicKey,
  hash31, normalizeCoordinate, parseServerInit, startClientHandshake, unwrapUkey2, wrapUkey2,
} from "../src/crypto/ukey2.js";
import { PbWriter, decode, getBytes, getMessage, getVarint } from "../src/protocol/protobuf.js";

describe("UKEY2", () => {
  it("D2D salt is 32 bytes", () => expect(D2D_SALT.length).toBe(32));

  it("normalizes coordinates (strip one leading zero, left-pad)", () => {
    expect(normalizeCoordinate(new Uint8Array([0, ...new Array(32).fill(1)])).length).toBe(32);
    expect([...normalizeCoordinate(new Uint8Array([5]))].slice(-2)).toEqual([0, 5]);
  });

  it("client init commits to SHA-512 of the wrapped client finish", () => {
    const h = startClientHandshake();
    const init = unwrapUkey2(h.clientInit);
    expect(init.type).toBe(Ukey2Type.CLIENT_INIT);
    const f = decode(init.data);
    expect(getVarint(f, 1)).toBe(1n);
    expect(getBytes(f, 2)!.length).toBe(32);
    const cc = getMessage(f, 3)!;
    expect(getVarint(cc, 1)).toBe(BigInt(P256_SHA512));
    expect(Buffer.from(getBytes(cc, 2)!).equals(createHash("sha512").update(h.clientFinish).digest())).toBe(true);
  });

  it("both sides derive the same keys; client/server keys follow the HKDF schedule", () => {
    const client = startClientHandshake();
    const server = createECDH("prime256v1");
    const spub = server.generateKeys();
    const serverInit = wrapUkey2(
      Ukey2Type.SERVER_INIT,
      new PbWriter().varint(1, 1).bytes(2, new Uint8Array(32)).varint(3, P256_SHA512).bytes(4, encodeGenericPublicKey(spub.subarray(1, 33), spub.subarray(33))).finish(),
    );
    const k = deriveUkey2Keys(client.ecdh, parseServerInit(serverInit), client.clientInit, serverInit);

    // Server side, independently: ECDH with the client's key from ClientFinished.
    const cf = decode(unwrapUkey2(client.clientFinish).data);
    const cpk = decodeGenericPublicKey(getBytes(cf, 1)!);
    const shared = server.computeSecret(Buffer.concat([Buffer.from([4]), cpk.x, cpk.y]));
    const secret = createHash("sha256").update(shared).digest();
    const next = Buffer.from(hkdfSync("sha256", secret, "UKEY2 v1 next", Buffer.concat([client.clientInit, serverInit]), 32));
    expect(Buffer.from(k.nextSecret).equals(next)).toBe(true);
    expect(Buffer.from(k.clientKey).equals(Buffer.from(hkdfSync("sha256", next, D2D_SALT, "client", 32)))).toBe(true);
    expect(k.authString.length).toBe(32);
  });

  it("rejects a server init with the wrong cipher", () => {
    const bad = wrapUkey2(Ukey2Type.SERVER_INIT, new PbWriter().varint(1, 1).bytes(2, new Uint8Array(32)).varint(3, 200).finish());
    expect(() => parseServerInit(bad)).toThrow(/cipher/);
  });
});

describe("payload keys (A-013 part 2)", () => {
  it("hash31 matches Java Arrays.hashCode with signed bytes", () => {
    expect(hash31(new Uint8Array([]))).toBe(1);
    expect(hash31(new Uint8Array([1, 2]))).toBe(994); // (31*(31*1+1))+2
    expect(hash31(new Uint8Array([0x80]))).toBe(31 - 128); // signed byte -128
    expect(hash31(new Uint8Array([0xff, 0xff]))).toBe(31 * (31 - 1) - 1);
    // 32-bit wraparound over a long input stays an int32
    const h = hash31(new Uint8Array(64).fill(0xc8));
    expect(h).toBe(h | 0);
  });

  it("rev1 orders by smaller hash, tie → server first, and is symmetric", () => {
    const a = new Uint8Array(32).fill(1);
    const b = new Uint8Array(32).fill(2);
    const k1 = derivePayloadKeys({ clientKey: a, serverKey: b }, true);
    const k2 = derivePayloadKeys({ clientKey: b, serverKey: a }, true);
    expect(Buffer.from(k1.aesKey).equals(Buffer.from(k2.aesKey))).toBe(true);
    const first = hash31(a) < hash31(b) ? a : b;
    const other = first === a ? b : a;
    const ikm = createHash("sha256").update(D2D_SALT).update(first).update(other).digest();
    expect(Buffer.from(k1.aesKey).equals(Buffer.from(hkdfSync("sha256", ikm, "Ditto salt 1", "Ditto info 1", 32)))).toBe(true);
    expect(Buffer.from(k1.hmacKey).equals(Buffer.from(hkdfSync("sha256", ikm, "Ditto salt 2", "Ditto info 2", 32)))).toBe(true);
  });

  it("f7 = 0 uses the raw client/server keys", () => {
    const a = new Uint8Array(32).fill(1);
    const b = new Uint8Array(32).fill(2);
    expect(derivePayloadKeys({ clientKey: a, serverKey: b }, false)).toEqual({ aesKey: a, hmacKey: b });
  });

  it("client finish prefixes coordinates with 0x00; init carries next_protocol", () => {
    const h = startClientHandshake();
    const pk = decode(getBytes(decode(unwrapUkey2(h.clientFinish).data), 1)!);
    const ec = getMessage(pk, 2)!;
    expect(getBytes(ec, 1)!.length).toBe(33);
    expect(getBytes(ec, 1)![0]).toBe(0);
    expect(new TextDecoder().decode(getBytes(decode(unwrapUkey2(h.clientInit).data), 4)!)).toBe(NEXT_PROTOCOL);
  });
});
