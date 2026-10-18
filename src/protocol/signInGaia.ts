// Registration/SignInGaia, per spec answer A-013 part 1 (#15), from the public bundle builder [B@1093001].
// Request: f1 AuthMessage (network "GDitto"), f2 device {f1 DeviceId, f36 optional bytes, f39 optional
// anti-abuse token}, f3 mode, f4 "GDitto". Mode 1 = lookup [B@1093386]; mode 0 = sign-in [B@~1094470].
// DeviceId and f36 per A-013 part 2.

import { randomBytes, randomUUID } from "node:crypto";
import { authMessageJspb, tokenFromJspb, type AuthMessageInput, type Token } from "./auth.js";
import { b64, field, jspb, unb64, type Jspb } from "./jspb.js";
import { PbWriter, decode, getVarint } from "./protobuf.js";

/** DeviceId message [B@722726]: f1 = enum 3, f2 = "messages-web-<id>" (A-013 part 2). */
export const DEVICE_ID_TYPE = 3;
export const DEVICE_ID_PREFIX = "messages-web-";

/** A fresh lower-cased random ID [B@1096360]; persist and reuse it (A-013 part 2). */
// The ID's exact random format is not specified; a lower-cased UUID is our choice.
export const newDeviceIdString = (): string => `${DEVICE_ID_PREFIX}${randomUUID().toLowerCase()}`;

/** Device f36 = serialized {f3: 32 random bytes} [B@1098826]; the 32 bytes are kept locally. */
export function newF36(): { encoded: Uint8Array; secret: Uint8Array } {
  const secret = new Uint8Array(randomBytes(32));
  return { encoded: new PbWriter().bytes(3, secret).finish(), secret };
}

/** Registration settings message (same type as f36) [B@1111291]: f1 enabled, f2 time ms, f4 pre-warm. */
export function decodeRegistrationSettings(b: Uint8Array): { enabled: boolean; timeMs: bigint; prewarm: boolean } {
  const f = decode(b);
  return { enabled: getVarint(f, 1) === 1n, timeMs: getVarint(f, 2) ?? 0n, prewarm: getVarint(f, 4) === 1n };
}

export const SignInGaiaMode = { SIGN_IN: 0, LOOKUP: 1 } as const;
export type SignInGaiaModeValue = (typeof SignInGaiaMode)[keyof typeof SignInGaiaMode];

/** gRPC NOT_FOUND; treated as an empty lookup list (A-013). */
export const GRPC_NOT_FOUND = 5;

export interface SignInGaiaInput {
  auth: Omit<AuthMessageInput, "network">;
  mode: SignInGaiaModeValue;
  /** DeviceId f2 string, e.g. from newDeviceIdString(). */
  deviceId: string;
  f36?: Uint8Array;
  /**
   * BotGuard token at device f39 (A-013 item 8). The official client adds it only behind a server
   * flag and sends without it if generation fails. This connector cannot produce one.
   */
  antiAbuseToken?: Uint8Array;
}

export function encodeSignInGaia(i: SignInGaiaInput): Jspb {
  const device = jspb({
    1: [DEVICE_ID_TYPE, i.deviceId],
    36: i.f36 ? b64(i.f36) : undefined,
    39: i.antiAbuseToken ? b64(i.antiAbuseToken) : undefined,
  });
  return jspb({
    1: authMessageJspb({ ...i.auth, network: "GDitto" }),
    2: device,
    // Mode 0 is the proto default and is omitted on the wire (A-013, INFERRED from capture).
    3: i.mode === SignInGaiaMode.SIGN_IN ? undefined : i.mode,
    4: "GDitto",
  });
}

const utf8 = (v: unknown): string | undefined => (typeof v === "string" ? Buffer.from(unb64(v)).toString("utf8") : undefined);

export interface Registration {
  /** Entry f1 bytes: the registration ID and pairing destination [B@1109153]. */
  id: Uint8Array;
  /** Entry f1 decoded as UTF-8 (the client also stores this form) [B@1112000]. */
  idText: string;
  /** Entry f3 type. */
  type?: number;
  /** Entry f7 last-update time (µs). */
  lastUpdateMicros?: bigint;
  /** Entry f8 parsed settings. */
  settings?: ReturnType<typeof decodeRegistrationSettings>;
}

const num = (v: unknown): bigint | undefined => (typeof v === "number" || typeof v === "string" ? BigInt(v) : undefined);

/** Mode 1: response f3 = repeated registrations (A-013 parts 1 and 2). */
export function decodeLookupResponse(v: unknown): Registration[] {
  const list = field(v, 3);
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new Error("SignInGaia lookup: f3 is not a list");
  return list.map((e) => {
    const raw = field(e, 1);
    if (typeof raw !== "string") throw new Error("SignInGaia lookup: entry missing f1");
    const id = unb64(raw);
    const s8 = field(e, 8);
    const t = num(field(e, 3));
    return {
      id,
      idText: Buffer.from(id).toString("utf8"),
      type: t === undefined ? undefined : Number(t),
      lastUpdateMicros: num(field(e, 7)),
      settings: typeof s8 === "string" ? decodeRegistrationSettings(unb64(s8)) : undefined,
    };
  });
}

/** Types eligible as a pairing destination [B@1108527]. */
export const PAIRABLE_REGISTRATION_TYPES: ReadonlySet<number> = new Set([1, 4]);

/**
 * Destination choice [B@1108527], [B@1111291], [B@1110530]: type 1 or 4, settings enabled, largest
 * settings time; reject if last update is older than `maxAgeMicros` (a client config value, UNVERIFIED).
 */
export function choosePairingDestination(regs: Registration[], nowMicros: bigint, maxAgeMicros?: bigint): Registration | undefined {
  const eligible = regs.filter((r) => r.type !== undefined && PAIRABLE_REGISTRATION_TYPES.has(r.type) && r.settings?.enabled);
  if (!eligible.length) return undefined;
  const best = eligible.reduce((a, b) => (b.settings!.timeMs > a.settings!.timeMs ? b : a));
  if (maxAgeMicros !== undefined && (best.lastUpdateMicros === undefined || nowMicros - best.lastUpdateMicros > maxAgeMicros)) return undefined;
  return best;
}

/** Mode 0: response f2 = UTF-8 ID string (matched against the lookup list), f4 = token {f1, f2 TTL µs}. */
export function decodeSignInResponse(v: unknown): { id: string; token: Token } {
  const id = utf8(field(v, 2));
  if (id === undefined) throw new Error("SignInGaia sign-in: response missing f2");
  return { id, token: tokenFromJspb(field(v, 4)) };
}
