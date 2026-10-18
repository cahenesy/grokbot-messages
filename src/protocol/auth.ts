// AuthMessage and device identity, SPEC.md §4 and §0.1 item 3/5.

import { randomUUID } from "node:crypto";
import { b64, field, jspb, unb64, type Jspb } from "./jspb.js";
import { PbWriter, getString, getVarint, type RawField } from "./protobuf.js";
import { SpecGapError } from "./specGaps.js";

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

/** ConfigVersion subfield numbers are not in SPEC.md (Q-001). */
export function configVersionJspb(_v: ConfigVersion): Jspb {
  throw new SpecGapError("Q-001");
}

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

/** Binary auth header used by the Pairing service: f1 requestId, f3 network (§4.1 step 2). */
export function authHeaderPb(network: Network, requestId: string = randomUUID()): PbWriter {
  return new PbWriter().string(1, requestId).string(3, network);
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
