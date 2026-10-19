// Browser↔phone payload encryption, SPEC.md §5.
// Scheme 2 (default): AES-256-CTR with a random 16-byte counter block, then
// HMAC-SHA256 over ciphertext‖IV, full 32-byte tag.
// Scheme 1: AES-128-GCM keyed with the first 16 bytes of the AES key, 12-byte nonce, 128-bit tag.
//
// Wire shape of action-envelope field 5 is UNVERIFIED: live sizes favour the flat
// ciphertext‖IV‖HMAC layout (OPEN-QUESTIONS §2), so both layouts are provided.
//
// Note: WebCrypto AES-CTR increments only the low `length` bits of the counter block;
// Node increments all 128. They differ only if the low 64 bits overflow inside one
// payload, which the random IV makes negligible for message-sized inputs.

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PbWriter, decode, getBytes, getVarint } from "../protocol/protobuf.js";

export interface PayloadKeys {
  aesKey: Uint8Array; // 32 bytes
  hmacKey: Uint8Array; // 32 bytes
}

export interface CtrHmacSealed {
  iv: Uint8Array; // 16
  ciphertext: Uint8Array;
  tag: Uint8Array; // 32
}

const IV_LEN = 16;
const TAG_LEN = 32;

function checkKeys(k: PayloadKeys): void {
  if (k.aesKey.length !== 32) throw new RangeError("AES key must be 32 bytes");
  if (k.hmacKey.length !== 32) throw new RangeError("HMAC key must be 32 bytes");
}

function mac(hmacKey: Uint8Array, ciphertext: Uint8Array, iv: Uint8Array): Uint8Array {
  return new Uint8Array(createHmac("sha256", hmacKey).update(ciphertext).update(iv).digest());
}

export function sealCtrHmac(keys: PayloadKeys, plaintext: Uint8Array, iv: Uint8Array = randomBytes(IV_LEN)): CtrHmacSealed {
  checkKeys(keys);
  if (iv.length !== IV_LEN) throw new RangeError("IV must be 16 bytes");
  const c = createCipheriv("aes-256-ctr", keys.aesKey, iv);
  const ciphertext = new Uint8Array(Buffer.concat([c.update(plaintext), c.final()]));
  return { iv: new Uint8Array(iv), ciphertext, tag: mac(keys.hmacKey, ciphertext, iv) };
}

export function openCtrHmac(keys: PayloadKeys, s: CtrHmacSealed): Uint8Array {
  checkKeys(keys);
  if (s.iv.length !== IV_LEN) throw new Error("IV must be 16 bytes");
  const expected = mac(keys.hmacKey, s.ciphertext, s.iv);
  if (s.tag.length !== TAG_LEN || !timingSafeEqual(expected, s.tag)) throw new Error("HMAC mismatch");
  const d = createDecipheriv("aes-256-ctr", keys.aesKey, s.iv);
  return new Uint8Array(Buffer.concat([d.update(s.ciphertext), d.final()]));
}

/** Flat layout: ciphertext ‖ IV(16) ‖ HMAC(32). Preferred wire hypothesis. */
export function toFlat(s: CtrHmacSealed): Uint8Array {
  return new Uint8Array(Buffer.concat([s.ciphertext, s.iv, s.tag]));
}

export function fromFlat(b: Uint8Array): CtrHmacSealed {
  if (b.length < IV_LEN + TAG_LEN) throw new Error("flat payload too short");
  const ctEnd = b.length - IV_LEN - TAG_LEN;
  return {
    ciphertext: b.slice(0, ctEnd),
    iv: b.slice(ctEnd, ctEnd + IV_LEN),
    tag: b.slice(ctEnd + IV_LEN),
  };
}

/** Container layout {1: scheme, 2: iv, 3: ciphertext, 4: tag} seen in the JS crypto helper. */
export function toContainer(s: CtrHmacSealed): Uint8Array {
  return new PbWriter().varint(1, 2).bytes(2, s.iv).bytes(3, s.ciphertext).bytes(4, s.tag).finish();
}

export function openContainer(keys: PayloadKeys, b: Uint8Array): Uint8Array {
  const f = decode(b);
  const scheme = getVarint(f, 1);
  const iv = getBytes(f, 2);
  const ciphertext = getBytes(f, 3);
  if (!iv || !ciphertext) throw new Error("container missing iv or ciphertext");
  if (scheme === 2n) {
    const tag = getBytes(f, 4);
    if (!tag) throw new Error("container missing HMAC tag");
    return openCtrHmac(keys, { iv, ciphertext, tag });
  }
  if (scheme === 1n) return openGcm(keys.aesKey, iv, ciphertext);
  throw new Error(`unknown encryption scheme ${scheme}`);
}

/** Scheme 1 decrypt. `data` is ciphertext with the 16-byte tag appended (WebCrypto convention). */
export function openGcm(aesKey: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array {
  if (nonce.length !== 12) throw new Error("GCM nonce must be 12 bytes");
  if (data.length < 16) throw new Error("GCM data too short");
  const d = createDecipheriv("aes-128-gcm", aesKey.subarray(0, 16), nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  return new Uint8Array(Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]));
}

export function sealGcm(aesKey: Uint8Array, plaintext: Uint8Array, nonce: Uint8Array = randomBytes(12)): { nonce: Uint8Array; data: Uint8Array } {
  const c = createCipheriv("aes-128-gcm", aesKey.subarray(0, 16), nonce);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return { nonce: new Uint8Array(nonce), data: new Uint8Array(Buffer.concat([ct, c.getAuthTag()])) };
}

export function generatePayloadKeys(): PayloadKeys {
  return { aesKey: new Uint8Array(randomBytes(32)), hmacKey: new Uint8Array(randomBytes(32)) };
}

/**
 * Wire cipher for envelope f5 (outbound) and f8 (inbound), A-018 item 5 [B@1076193–1078094]:
 * AES-CTR with a random 16-byte IV as the full 128-bit counter block (16- or 32-byte key), tag =
 * HMAC-SHA256(hmacKey, ct ‖ IV), wire = ct ‖ IV ‖ tag. Empty plaintext is passed through unencrypted
 * in both directions; anything else shorter than 48 bytes is rejected.
 */
export function encryptPayload(keys: PayloadKeys, plaintext: Uint8Array, iv: Uint8Array = randomBytes(IV_LEN)): Uint8Array {
  if (plaintext.length === 0) return new Uint8Array();
  const alg = ctrAlgorithm(keys.aesKey);
  if (iv.length !== IV_LEN) throw new RangeError("IV must be 16 bytes");
  const c = createCipheriv(alg, keys.aesKey, iv);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return new Uint8Array(Buffer.concat([ct, iv, mac(keys.hmacKey, ct, iv)]));
}

/**
 * Decrypts the wire form. A zero-length input is the protocol's unencrypted empty message (A-018) and
 * carries no authentication, so it is accepted only when the caller passes `allowEmpty` for a response
 * where an empty message is a legitimate answer (e.g. an all-defaults proto3 reply).
 */
export function decryptPayload(keys: PayloadKeys, wire: Uint8Array, o: { allowEmpty?: boolean } = {}): Uint8Array {
  if (wire.length === 0) {
    if (o.allowEmpty) return new Uint8Array();
    throw new Error("empty encrypted payload not accepted here");
  }
  if (wire.length < IV_LEN + TAG_LEN) throw new Error("encrypted payload shorter than 48 bytes");
  const tag = wire.subarray(wire.length - TAG_LEN);
  const iv = wire.subarray(wire.length - TAG_LEN - IV_LEN, wire.length - TAG_LEN);
  const ct = wire.subarray(0, wire.length - TAG_LEN - IV_LEN);
  if (!timingSafeEqual(mac(keys.hmacKey, ct, iv), tag)) throw new Error("HMAC mismatch");
  const d = createDecipheriv(ctrAlgorithm(keys.aesKey), keys.aesKey, iv);
  return new Uint8Array(Buffer.concat([d.update(ct), d.final()]));
}

function ctrAlgorithm(aesKey: Uint8Array): "aes-128-ctr" | "aes-256-ctr" {
  if (aesKey.length === 32) return "aes-256-ctr";
  if (aesKey.length === 16) return "aes-128-ctr";
  throw new RangeError("AES key must be 16 or 32 bytes");
}
