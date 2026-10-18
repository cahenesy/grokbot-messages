// Google-account pairing rounds carrying UKEY2 (spec answer A-013 part 2, #15).
// Sent unencrypted over the messaging path (envelope f3) with a 300 s deadline [B@1051105], [B@1051293]:
// round 1 = action 44 (ClientInit, to every candidate destination), round 2 = action 45 (ClientFinish,
// to the destination that answered). Plaintext encoding INFERRED binary protobuf (A-013, A-009).

import { unwrapUkey2, Ukey2Type } from "../crypto/ukey2.js";
import { encodeBrowserDetails, type BrowserDetails } from "./pairing.js";
import { PbWriter, decode, getBytes, getString, getVarint } from "./protobuf.js";

export const GAIA_PAIRING_ROUND1_ACTION = 44;
export const GAIA_PAIRING_ROUND2_ACTION = 45;
export const GAIA_PAIRING_DEADLINE_MICROS = 300_000_000n;

/** Literal the official client writes to request f8 (A-013 parts 1 and 2, [B@1101393]). */
export const GOOGLE_UNDOCUMENTED_API_NOTICE =
  "This is an undocumented API. Use or access of undocumented Google APIs without express authorization is prohibited per the Google API Terms of Service (https://developers.google.com/terms).";

/** Maximum accepted round-1 response version values f6/f7/f9 [B@1101066–1101200]. */
export const MAX_VERSIONS = { f6: 1n, f7: 1n, f9: 0n } as const;

export interface PairingRequestInput {
  /** f1: fresh lower-cased random ID per attempt [B@1111848]. */
  sessionId: string;
  /** f2: browser info [B@1086151]. */
  browser: BrowserDetails;
  /** f3: server-adjusted clock time, INFERRED milliseconds [B@1042865]. Same value in both rounds. */
  timeMs: bigint;
  /** f4: serialized UKEY2 wrapper message {f1 type, f2 data} [B@384896–384988]. */
  ukey2: Uint8Array;
  /** f8: notice string; second request only, when the server version value is 0. */
  notice?: string;
}

/** Pairing request [B@385305]: f1, f2, f3, f4, then f5 = 1, f6 = 1, f7 = 0 (zero omitted as the default). */
export function encodePairingRequest(i: PairingRequestInput): Uint8Array {
  const w = new PbWriter()
    .string(1, i.sessionId)
    .message(2, encodeBrowserDetails(i.browser))
    .varint(3, i.timeMs)
    .bytes(4, i.ukey2)
    .varint(5, 1)
    .varint(6, 1);
  if (i.notice !== undefined) w.string(8, i.notice);
  return w.finish();
}

export class GaiaPairingError extends Error {
  constructor(message: string, readonly status?: number, readonly errorCode?: number) {
    super(message);
    this.name = "GaiaPairingError";
  }
}

function checkCommon(b: Uint8Array, sessionId: string) {
  const f = decode(b);
  if (getString(f, 4) !== sessionId) throw new GaiaPairingError("pairing response does not echo the session id");
  const status = Number(getVarint(f, 1) ?? 0n);
  if (status !== 0) throw new GaiaPairingError("pairing rejected by phone", status, Number(getVarint(f, 2) ?? 0n));
  return f;
}

export interface Round1Response {
  /** Serialized ServerInit wrapper (type 3), exactly as received: it is part of the HKDF transcript. */
  serverInit: Uint8Array;
  versionF6: bigint;
  /** f7 = 1 selects rev1 ("Ditto") payload keys. */
  rev1: boolean;
  versionF9: bigint;
}

/** Round-1 response [B@1102900–1103600]: f1 status, f2 error, f3 present, f4 echo, f5 UKEY2 wrapper type 3, f6/f7/f9. */
export function decodeRound1Response(b: Uint8Array, sessionId: string): Round1Response {
  const f = checkCommon(b, sessionId);
  if (getBytes(f, 3) === undefined && getVarint(f, 3) === undefined) throw new GaiaPairingError("pairing response missing f3");
  const serverInit = getBytes(f, 5);
  if (!serverInit) throw new GaiaPairingError("pairing response missing UKEY2 message");
  if (unwrapUkey2(serverInit).type !== Ukey2Type.SERVER_INIT) throw new GaiaPairingError("pairing response is not a ServerInit");
  const v6 = getVarint(f, 6) ?? 0n;
  const v7 = getVarint(f, 7) ?? 0n;
  const v9 = getVarint(f, 9) ?? 0n;
  if (v6 > MAX_VERSIONS.f6 || v7 > MAX_VERSIONS.f7 || v9 > MAX_VERSIONS.f9) throw new GaiaPairingError("unsupported pairing version");
  return { serverInit, versionF6: v6, rev1: v7 === 1n, versionF9: v9 };
}

/** Round-2 response [B@1102106]: f4 echo, f1 status, f8 optional encrypted bytes (skipped in v1). */
export function decodeRound2Response(b: Uint8Array, sessionId: string): { extra?: Uint8Array } {
  const f = checkCommon(b, sessionId);
  return { extra: getBytes(f, 8) };
}
