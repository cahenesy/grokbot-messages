import { describe, expect, it } from "vitest";
import { createECDH, createHash, hkdfSync } from "node:crypto";
import {
  D2D_SALT, P256_SHA512, Ukey2Type, decodeGenericPublicKey, derivePayloadKeys, deriveUkey2Keys, encodeGenericPublicKey, parseServerInit,
  startClientHandshake, unwrapUkey2, wrapUkey2,
} from "../src/crypto/ukey2.js";
import {
  GAIA_PAIRING_ROUND1_ACTION, GAIA_PAIRING_ROUND2_ACTION, GaiaPairingError, decodeRound1Response, decodeRound2Response, encodePairingRequest,
} from "../src/protocol/gaiaPairing.js";
import { PbWriter, decode, getBytes, getMessage, getString, getVarint } from "../src/protocol/protobuf.js";

const browser = { userAgent: "grokbot-messages/test", browserType: 1, os: "Linux" as const };
const SID = "pairing-session-fixture";

/** Simulated phone side, written from the same spec facts, to check both ends agree. */
function phone(clientInitWrapped: Uint8Array) {
  const ecdh = createECDH("prime256v1");
  const pub = ecdh.generateKeys();
  const serverInit = wrapUkey2(
    Ukey2Type.SERVER_INIT,
    new PbWriter().varint(1, 1).bytes(2, new Uint8Array(32).fill(7)).varint(3, P256_SHA512).bytes(4, encodeGenericPublicKey(pub.subarray(1, 33), pub.subarray(33))).finish(),
  );
  const commitment = getBytes(getMessage(decode(unwrapUkey2(clientInitWrapped).data), 3)!, 2)!;
  return {
    serverInit,
    finish(clientFinishWrapped: Uint8Array) {
      expect(Buffer.from(createHash("sha512").update(clientFinishWrapped).digest()).equals(Buffer.from(commitment))).toBe(true);
      const cpk = decodeGenericPublicKey(getBytes(decode(unwrapUkey2(clientFinishWrapped).data), 1)!);
      const secret = createHash("sha256").update(ecdh.computeSecret(Buffer.concat([Buffer.from([4]), cpk.x, cpk.y]))).digest();
      const next = hkdfSync("sha256", secret, "UKEY2 v1 next", Buffer.concat([clientInitWrapped, serverInit]), 32);
      return {
        clientKey: new Uint8Array(hkdfSync("sha256", next, D2D_SALT, "client", 32)),
        serverKey: new Uint8Array(hkdfSync("sha256", next, D2D_SALT, "server", 32)),
      };
    },
  };
}

describe("Google-account pairing rounds (A-013 part 2)", () => {
  it("round 1 request layout: f1 session, f2 browser, f3 time, f4 ClientInit wrapper, f5 = 1, f6 = 1", () => {
    const h = startClientHandshake();
    const req = decode(encodePairingRequest({ sessionId: SID, browser, timeMs: 1760000000000n, ukey2: h.clientInit }));
    expect(getString(req, 1)).toBe(SID);
    expect(getString(getMessage(req, 2)!, 1)).toBe("grokbot-messages/test");
    expect(getVarint(req, 3)).toBe(1760000000000n);
    expect(unwrapUkey2(getBytes(req, 4)!).type).toBe(Ukey2Type.CLIENT_INIT);
    expect(getVarint(req, 5)).toBe(1n);
    expect(getVarint(req, 6)).toBe(1n);
    expect(getVarint(req, 7)).toBeUndefined();
    expect(getString(req, 8)).toBeUndefined();
    expect([GAIA_PAIRING_ROUND1_ACTION, GAIA_PAIRING_ROUND2_ACTION]).toEqual([44, 45]);
  });

  it("full handshake: both sides derive the same payload keys (rev1 and f7 = 0)", () => {
    const h = startClientHandshake();
    const p = phone(h.clientInit);
    for (const rev1 of [true, false]) {
      const resp = new PbWriter().varint(1, 0).varint(3, 1).string(4, SID).bytes(5, p.serverInit).varint(6, 1).varint(7, rev1 ? 1 : 0).finish();
      const r1 = decodeRound1Response(resp, SID);
      expect(r1.rev1).toBe(rev1);
      const ours = derivePayloadKeys(deriveUkey2Keys(h.ecdh, parseServerInit(r1.serverInit), h.clientInit, r1.serverInit), r1.rev1);
      const theirs = derivePayloadKeys(p.finish(h.clientFinish), rev1);
      expect(Buffer.from(ours.aesKey).equals(Buffer.from(theirs.aesKey))).toBe(true);
      expect(Buffer.from(ours.hmacKey).equals(Buffer.from(theirs.hmacKey))).toBe(true);
    }
  });

  it("rejects wrong session echo, non-zero status, and versions above the limits", () => {
    const h = startClientHandshake();
    const p = phone(h.clientInit);
    const base = (o: { sid?: string; status?: number; v6?: number }) =>
      new PbWriter().varint(1, o.status ?? 0).varint(3, 1).string(4, o.sid ?? SID).bytes(5, p.serverInit).varint(6, o.v6 ?? 1).finish();
    expect(() => decodeRound1Response(base({ sid: "other" }), SID)).toThrow(/echo/);
    expect(() => decodeRound1Response(base({ status: 3 }), SID)).toThrow(GaiaPairingError);
    expect(() => decodeRound1Response(base({ v6: 2 }), SID)).toThrow(/version/);
  });

  it("round 2 response returns optional f8", () => {
    const r = decodeRound2Response(new PbWriter().varint(1, 0).string(4, SID).bytes(8, new Uint8Array([1])).finish(), SID);
    expect([...r.extra!]).toEqual([1]);
  });
});
