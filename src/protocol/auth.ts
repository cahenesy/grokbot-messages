// AuthMessage and device identity, SPEC.md §4 and §0.1 item 3/5.

import { randomUUID } from "node:crypto";
import { b64, field, jspb, unb64, type Jspb } from "./jspb.js";
import { PbWriter, getString, getVarint, type RawField } from "./protobuf.js";

export type Network = "Bugle" | "GDitto" | "RCS";

/** Device identity: [typeEnum, sourceId, network]. typeEnum 16 = GDitto browser (VERIFIED-LIVE). */
export interface DeviceIdentity {
  type: number;
  sourceId: string;
  network: string;
}

export interface ConfigVersion {
  year: number;
  month: number;
  day: number;
  v1: number;
  v2: number;
}

export function deviceIdentityJspb(d: DeviceIdentity): Jspb {
  return [d.type, d.sourceId, d.network];
}

export function deviceIdentityFromJspb(v: unknown): DeviceIdentity {
  const type = field(v, 1);
  const sourceId = field(v, 2);
  const network = field(v, 3);
  if (typeof sourceId !== "string" || typeof network !== "string") throw new Error("malformed device identity");
  return { type: Number(type ?? 0), sourceId, network };
}

export function deviceIdentityFromPb(f: RawField[]): DeviceIdentity {
  const sourceId = getString(f, 2);
  const network = getString(f, 3);
  if (sourceId === undefined || network === undefined) throw new Error("malformed device identity");
  return { type: Number(getVarint(f, 1) ?? 0n), sourceId, network };
}

/**
 * ConfigVersion: f3 year, f4 month, f5 day, f7 V1, f9 V2.
 * Field numbers from the public bundle `TACHYON_CLIENT_INFO` [B@973382] (DEVLOG 2026-10-18),
 * matched to the VERIFIED-LIVE values 2026/10/15/4/6 (A-001). Pending spec-team review (#1).
 */
export function configVersionJspb(v: ConfigVersion): Jspb {
  return jspb({ 3: v.year, 4: v.month, 5: v.day, 7: v.v1, 9: v.v2 });
}

/** Values seen live on 2026-10-18 for build messagesweb.mw.en_US.4-84y6pqYJM.O (A-001). They track the client build. */
export const CONFIG_VERSION_2026_10_15: ConfigVersion = { year: 2026, month: 10, day: 15, v1: 4, v2: 6 };

export interface AuthMessageInput {
  network: Network;
  token?: Uint8Array;
  configVersion?: ConfigVersion;
  requestId?: string;
}

/** JSPB AuthMessage: f1 requestId, f3 network, f6 token, f7 ConfigVersion. */
export function authMessageJspb(a: AuthMessageInput): Jspb {
  return jspb({
    1: a.requestId ?? randomUUID(),
    3: a.network,
    6: a.token ? b64(a.token) : undefined,
    7: a.configVersion ? configVersionJspb(a.configVersion) : undefined,
  });
}

/** Binary ConfigVersion: f3 year, f4 month, f5 day, f7 V1, f9 V2 (A-021 [B@973382]). */
export function configVersionPb(v: ConfigVersion): PbWriter {
  return new PbWriter().varint(3, v.year).varint(4, v.month).varint(5, v.day).varint(7, v.v1).varint(9, v.v2);
}

/**
 * Binary auth header for the Pairing service: f1 request ID, f3 network, f6 token (authenticated calls),
 * f7 ConfigVersion. The client's common request path fills f1/f6/f7 [B@734302]; without f7 RegisterPhoneRelay
 * returns 400 INVALID_ARGUMENT (T-002 on #16, VERIFIED-LIVE).
 */
export function authHeaderPb(network: Network, o: { requestId?: string; token?: Uint8Array; configVersion: ConfigVersion }): PbWriter {
  const w = new PbWriter().string(1, o.requestId ?? randomUUID()).string(3, network);
  if (o.token) w.bytes(6, o.token);
  return w.message(7, configVersionPb(o.configVersion));
}

/** Parses an 8-digit YYYYMMDD build string (MW_CONFIG[0]) into a ConfigVersion with the client constants V1 = 4, V2 = 6 (A-021 [B@784158]). */
export function configVersionFromBuildString(s: unknown): ConfigVersion | undefined {
  if (typeof s !== "string" || !/^\d{8}$/.test(s)) return undefined;
  return { year: Number(s.slice(0, 4)), month: Number(s.slice(4, 6)), day: Number(s.slice(6, 8)), v1: 4, v2: 6 };
}

export interface Token {
  token: Uint8Array;
  ttlMicros: bigint;
}

/** Token submessage in JSPB: [tokenB64, ttl]. TTL may arrive as number or decimal string. */
export function tokenFromJspb(v: unknown): Token {
  const t = field(v, 1);
  const ttl = field(v, 2);
  if (typeof t !== "string") throw new Error("token missing");
  if (typeof ttl !== "string" && typeof ttl !== "number") throw new Error("token TTL missing");
  return { token: unb64(t), ttlMicros: BigInt(ttl) };
}
