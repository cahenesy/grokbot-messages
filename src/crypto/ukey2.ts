// UKEY2 handshake pieces and Ditto payload-key derivation, SPEC.md §4.2.
// Message field numbers come from Google's Apache-2.0 UKEY2 library (github.com/google/ukey2,
// commit 10fc737, src/main/proto/ukey.proto and securemessage.proto); see DEVLOG.md.

import { createECDH, createHash, hkdfSync, randomBytes, type ECDH } from "node:crypto";
import { PbWriter, decode, getBytes, getMessage, getVarint } from "../protocol/protobuf.js";

/** Standard UKEY2/D2D salt (ukey2 d2d_crypto_ops.cc `kSalt`; SPEC §4.2 says take it from the library). */
export const D2D_SALT = Buffer.from("82aa55a0d397f88346ca1cee8d3909b95f13fa7deb1d4ab38376b8256da85510", "hex");

/** Ukey2Message.Type (ukey.proto). */
export const Ukey2Type = { ALERT: 1, CLIENT_INIT: 2, SERVER_INIT: 3, CLIENT_FINISH: 4 } as const;
/** Ukey2HandshakeCipher P256_SHA512 (ukey.proto; SPEC §4.2 "cipher value 100"). */
export const P256_SHA512 = 100;
/** Protocol version checked by the client (SPEC §4.2). */
export const UKEY2_VERSION = 1;
/** securemessage.proto PublicKeyType.EC_P256. */
const EC_P256 = 1;

const hkdf32 = (ikm: Uint8Array, salt: Uint8Array | string, info: Uint8Array | string): Uint8Array =>
  new Uint8Array(hkdfSync("sha256", ikm, salt, info, 32));

/** Strip one leading zero from a 33-byte coordinate and left-pad to 32 bytes (SPEC §4.2). */
export function normalizeCoordinate(c: Uint8Array): Uint8Array {
  let v = c;
  if (v.length === 33 && v[0] === 0) v = v.subarray(1);
  if (v.length > 32) throw new Error("EC coordinate longer than 32 bytes");
  const out = new Uint8Array(32);
  out.set(v, 32 - v.length);
  return out;
}

/**
 * GenericPublicKey {1: type EC_P256, 2: EcP256PublicKey {1: x, 2: y}} (securemessage.proto).
 * The web client's ClientFinished prefixes each 32-byte coordinate with 0x00 [B@195949] (A-013 part 2).
 */
export function encodeGenericPublicKey(x: Uint8Array, y: Uint8Array, zeroPrefix = false): Uint8Array {
  const c = (v: Uint8Array) => (zeroPrefix ? Buffer.concat([Buffer.from([0]), v]) : v);
  return new PbWriter().varint(1, EC_P256).message(2, new PbWriter().bytes(1, c(x)).bytes(2, c(y))).finish();
}

/** ClientInit next_protocol used by the web client [B@781510] (A-013 part 2). */
export const NEXT_PROTOCOL = "AES_256_CBC-HMAC_SHA256";

export function decodeGenericPublicKey(b: Uint8Array): { x: Uint8Array; y: Uint8Array } {
  const f = decode(b);
  if (getVarint(f, 1) !== BigInt(EC_P256)) throw new Error("server public key is not EC P-256");
  const ec = getMessage(f, 2);
  const x = ec && getBytes(ec, 1);
  const y = ec && getBytes(ec, 2);
  if (!x || !y) throw new Error("server public key missing coordinates");
  return { x: normalizeCoordinate(x), y: normalizeCoordinate(y) };
}

export const wrapUkey2 = (type: number, data: Uint8Array): Uint8Array => new PbWriter().varint(1, type).bytes(2, data).finish();

export function unwrapUkey2(b: Uint8Array): { type: number; data: Uint8Array } {
  const f = decode(b);
  const type = getVarint(f, 1);
  const data = getBytes(f, 2);
  if (type === undefined || !data) throw new Error("malformed Ukey2Message");
  return { type: Number(type), data };
}

export interface ClientHandshake {
  ecdh: ECDH;
  /** Wrapped Ukey2Message(CLIENT_INIT). */
  clientInit: Uint8Array;
  /** Wrapped Ukey2Message(CLIENT_FINISH), committed to by clientInit. */
  clientFinish: Uint8Array;
}

/**
 * Builds ClientInit {1 version, 2 random(32), 3 [CipherCommitment {1 cipher 100, 2 SHA-512(clientFinish)}], 4 next_protocol}
 * and the ClientFinished {1 public_key} it commits to (SPEC §4.2; ukey.proto).
 */
export function startClientHandshake(nextProtocol: string | undefined = NEXT_PROTOCOL): ClientHandshake {
  const ecdh = createECDH("prime256v1");
  const pub = ecdh.generateKeys(); // 0x04 ‖ X ‖ Y
  const clientFinish = wrapUkey2(Ukey2Type.CLIENT_FINISH, new PbWriter().bytes(1, encodeGenericPublicKey(pub.subarray(1, 33), pub.subarray(33), true)).finish());
  const commitment = createHash("sha512").update(clientFinish).digest();
  const init = new PbWriter()
    .varint(1, UKEY2_VERSION)
    .bytes(2, randomBytes(32))
    .message(3, new PbWriter().varint(1, P256_SHA512).bytes(2, commitment));
  if (nextProtocol !== undefined) init.string(4, nextProtocol);
  return { ecdh, clientInit: wrapUkey2(Ukey2Type.CLIENT_INIT, init.finish()), clientFinish };
}

/** Validates ServerInit {1 version == 1, 2 random (32 bytes), 3 cipher == 100, 4 public key} (SPEC §4.2). */
export function parseServerInit(wrapped: Uint8Array): { x: Uint8Array; y: Uint8Array } {
  const { type, data } = unwrapUkey2(wrapped);
  if (type !== Ukey2Type.SERVER_INIT) throw new Error(`expected SERVER_INIT, got type ${type}`);
  const f = decode(data);
  if (getVarint(f, 1) !== BigInt(UKEY2_VERSION)) throw new Error("unsupported UKEY2 version");
  if (getBytes(f, 2)?.length !== 32) throw new Error("server random missing or not 32 bytes");
  if (getVarint(f, 3) !== BigInt(P256_SHA512)) throw new Error("unsupported handshake cipher");
  const pk = getBytes(f, 4);
  if (!pk) throw new Error("server public key missing");
  return decodeGenericPublicKey(pk);
}

export interface Ukey2Keys {
  authString: Uint8Array;
  nextSecret: Uint8Array;
  clientKey: Uint8Array;
  serverKey: Uint8Array;
}

/**
 * Key schedule (SPEC §4.2): secret = SHA-256(ECDH 256-bit shared secret);
 * auth = HKDF(secret, "UKEY2 v1 auth", ci‖si); next = HKDF(secret, "UKEY2 v1 next", ci‖si);
 * client/server = HKDF(next, D2D salt, "client"/"server"). `clientInit`/`serverInit` are the bytes
 * exactly as sent/received (whether those are wrapped Ukey2Messages on this service is Q-013).
 */
export function deriveUkey2Keys(ecdh: ECDH, server: { x: Uint8Array; y: Uint8Array }, clientInit: Uint8Array, serverInit: Uint8Array): Ukey2Keys {
  const shared = ecdh.computeSecret(Buffer.concat([Buffer.from([4]), server.x, server.y]));
  const secret = createHash("sha256").update(shared).digest();
  const info = Buffer.concat([clientInit, serverInit]);
  const authString = hkdf32(secret, "UKEY2 v1 auth", info);
  const nextSecret = hkdf32(secret, "UKEY2 v1 next", info);
  return { authString, nextSecret, clientKey: hkdf32(nextSecret, D2D_SALT, "client"), serverKey: hkdf32(nextSecret, D2D_SALT, "server") };
}

/**
 * Java `Arrays.hashCode(byte[])` pattern (A-013 part 2, [B@195200]): h = 1; for each byte,
 * h = (31·h + signed_byte) | 0, in 32-bit signed arithmetic.
 */
export function hash31(b: Uint8Array): number {
  let h = 1;
  for (const x of b) h = (Math.imul(31, h) + (x > 127 ? x - 256 : x)) | 0;
  return h;
}

export interface PayloadKeyPair {
  aesKey: Uint8Array;
  hmacKey: Uint8Array;
}

/**
 * Session payload keys after the UKEY2 rounds (A-013 part 2, [B@1102309], [B@1099525], [B@1112062]).
 * - rev1 (round-1 response f7 = 1): first = key with the smaller h (strict <, so a tie picks the
 *   server key); IKM = SHA-256(D2D salt ‖ first ‖ other); key1 = HKDF(IKM, "Ditto salt 1", "Ditto info 1"),
 *   key2 = HKDF(IKM, "Ditto salt 2", "Ditto info 2"). Per SPEC §4.2, key1 is the AES key and key2 the HMAC key.
 * - f7 = 0: the raw client and server keys. Mapping client→AES, server→HMAC is INFERRED from key1/key2
 *   replacing client/server in that order.
 */
export function derivePayloadKeys(k: Pick<Ukey2Keys, "clientKey" | "serverKey">, rev1: boolean): PayloadKeyPair {
  if (!rev1) return { aesKey: k.clientKey, hmacKey: k.serverKey };
  const clientFirst = hash31(k.clientKey) < hash31(k.serverKey);
  const [first, other] = clientFirst ? [k.clientKey, k.serverKey] : [k.serverKey, k.clientKey];
  const ikm = createHash("sha256").update(D2D_SALT).update(first).update(other).digest();
  return { aesKey: hkdf32(ikm, "Ditto salt 1", "Ditto info 1"), hmacKey: hkdf32(ikm, "Ditto salt 2", "Ditto info 2") };
}
