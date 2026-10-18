import { describe, expect, it } from "vitest";
import { createECDH, createHash, hkdfSync } from "node:crypto";
import {
  D2D_SALT, P256_SHA512, Ukey2Type, decodeGenericPublicKey, deriveDittoPayloadKeys, deriveUkey2Keys, encodeGenericPublicKey,
  hash31, normalizeCoordinate, parseServerInit, startClientHandshake, unwrapUkey2, wrapUkey2,
} from "../src/crypto/ukey2.js";
import { PbWriter, decode, getBytes, getMessage, getVarint } from "../src/protocol/protobuf.js";
import { SpecGapError } from "../src/protocol/specGaps.js";

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

describe("Ditto payload keys", () => {
  const keys = { clientKey: new Uint8Array(32).fill(1), serverKey: new Uint8Array(32).fill(2) };
  it("refuses until the ordering rules are specified (Q-013)", () => {
    expect(() => deriveDittoPayloadKeys(keys)).toThrow(SpecGapError);
  });
  it("derives 32-byte keys and is symmetric in client/server once ordered", () => {
    const o = { signedBytes: true, int32: true, ascending: true };
    const a = deriveDittoPayloadKeys(keys, o);
    const b = deriveDittoPayloadKeys({ clientKey: keys.serverKey, serverKey: keys.clientKey }, o);
    expect(a.aesKey.length).toBe(32);
    expect(Buffer.from(a.aesKey).equals(Buffer.from(b.aesKey))).toBe(true);
    expect(Buffer.from(a.aesKey).equals(Buffer.from(a.hmacKey))).toBe(false);
  });
  it("hash31 signed vs unsigned differ for high bytes", () => {
    expect(hash31(new Uint8Array([200]), { signedBytes: true, int32: true })).toBe(-56n);
    expect(hash31(new Uint8Array([200]), { signedBytes: false, int32: true })).toBe(200n);
  });
});
