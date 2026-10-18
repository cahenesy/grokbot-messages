// QR (phone-relay) pairing messages, SPEC.md §4.1. Pairing service uses binary protobuf.

import { authHeaderPb, deviceIdentityFromPb, type DeviceIdentity, type Token } from "./auth.js";
import { PbWriter, decode, getBytes, getMessage, getVarint, type RawField } from "./protobuf.js";
import { SpecGapError } from "./specGaps.js";

/** Browser-type enum (§4.1 step 2; exact mapping INFERRED). The connector is not a browser, so "other". */
export const BROWSER_TYPE_OTHER = 1;

export interface BrowserDetails {
  userAgent: string;
  browserType: number;
  os: "" | "Windows" | "Mac" | "ChromeOS" | "Android" | "iOS" | "Linux";
  /** f5 and f6 meanings are not specified; omitted unless set. */
  flag5?: boolean;
  deviceKind?: 1 | 2 | 3;
}

export interface RegisterPhoneRelayInput {
  browser: BrowserDetails;
  spkiDer: Uint8Array;
  requestId?: string;
  /** Field number of the SPKI inside the f4 key-data submessage (Q-002). */
  keyFieldNumber?: number;
}

export function encodeRegisterPhoneRelay(i: RegisterPhoneRelayInput): Uint8Array {
  if (i.keyFieldNumber === undefined) throw new SpecGapError("Q-002");
  const browser = new PbWriter().string(1, i.browser.userAgent).varint(2, i.browser.browserType).string(3, i.browser.os);
  if (i.browser.flag5 !== undefined) browser.varint(5, i.browser.flag5);
  if (i.browser.deviceKind !== undefined) browser.varint(6, i.browser.deviceKind);
  const keyData = new PbWriter().varint(1, 2).bytes(i.keyFieldNumber, i.spkiDer);
  return new PbWriter()
    .message(1, authHeaderPb("Bugle", i.requestId))
    .message(3, browser)
    .message(4, keyData)
    .finish();
}

export interface RegisterPhoneRelayResult {
  pairingKey: Uint8Array;
  token: Token;
}

function tokenFromPb(f: RawField[] | undefined): Token {
  const token = f && getBytes(f, 1);
  const ttl = f && getVarint(f, 2);
  if (!token || ttl === undefined) throw new Error("token submessage missing token or TTL");
  return { token, ttlMicros: ttl };
}

export function decodeRegisterPhoneRelayResponse(b: Uint8Array): RegisterPhoneRelayResult {
  const f = decode(b);
  const pairingKey = getBytes(f, 3);
  if (!pairingKey) throw new Error("RegisterPhoneRelay response missing pairing key (f3)");
  return { pairingKey, token: tokenFromPb(getMessage(f, 5)) };
}

/** RefreshPhoneRelay response: f2 = new pairing key (§4.1 step 5). */
export function decodeRefreshPhoneRelayResponse(b: Uint8Array): Uint8Array {
  const k = getBytes(decode(b), 2);
  if (!k) throw new Error("RefreshPhoneRelay response missing pairing key (f2)");
  return k;
}

export type QrBase64 = "standard" | "url"; // which one the phone accepts is UNVERIFIED

export const DEFAULT_QR_BASE_URL = "https://support.google.com/messages/?p=web_computer"; // INFERRED (§4.1 step 3)

/** QR payload {1: pairingKey, 2: aesKey, 3: hmacKey}, displayed as `<base>#?c=<base64>`. */
export function qrUrl(pairingKey: Uint8Array, aesKey: Uint8Array, hmacKey: Uint8Array, opts: { base?: string; variant?: QrBase64 } = {}): string {
  const payload = new PbWriter().bytes(1, pairingKey).bytes(2, aesKey).bytes(3, hmacKey).finish();
  const enc = Buffer.from(payload).toString(opts.variant === "url" ? "base64url" : "base64");
  return `${opts.base ?? DEFAULT_QR_BASE_URL}#?c=${enc}`;
}

export interface PairedData {
  phone: DeviceIdentity; // stored as tachyon_auth_dest_id
  token: Token;
  browser: DeviceIdentity; // stored as tachyon_auth_desktop_id
}

/** Decode the route-14 container (binary protobuf assumed; see Q-004): f4 = paired data. */
export function decodePairedContainer(b: Uint8Array): PairedData | undefined {
  const paired = getMessage(decode(b), 4);
  if (!paired) return undefined;
  const phone = getMessage(paired, 1);
  const browser = getMessage(paired, 3);
  if (!phone || !browser) throw new Error("paired data missing device identities");
  return { phone: deviceIdentityFromPb(phone), token: tokenFromPb(getMessage(paired, 2)), browser: deviceIdentityFromPb(browser) };
}

export const PAIRING_EVENT_ROUTE = 14;
