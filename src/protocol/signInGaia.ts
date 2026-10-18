// Registration/SignInGaia, per spec answer A-013 part 1 (#15), from the public bundle builder [B@1093001].
// Request: f1 AuthMessage (network "GDitto"), f2 device {f1 device ID, f36 optional bytes, f39 optional
// anti-abuse token}, f3 mode, f4 "GDitto". Mode 1 = lookup [B@1093386]; mode 0 = sign-in [B@~1094470].
// The device ID's origin, f36 derivation and UKEY2 placement are A-013 part 2 (Q-013).

import { authMessageJspb, tokenFromJspb, type AuthMessageInput, type Token } from "./auth.js";
import { b64, field, jspb, unb64, type Jspb } from "./jspb.js";

export const SignInGaiaMode = { SIGN_IN: 0, LOOKUP: 1 } as const;
export type SignInGaiaModeValue = (typeof SignInGaiaMode)[keyof typeof SignInGaiaMode];

/** gRPC NOT_FOUND; treated as an empty lookup list (A-013). */
export const GRPC_NOT_FOUND = 5;

export interface SignInGaiaInput {
  auth: Omit<AuthMessageInput, "network">;
  mode: SignInGaiaModeValue;
  deviceId: Uint8Array;
  f36?: Uint8Array;
  /**
   * BotGuard token at device f39 (A-013 item 8). The official client adds it only behind a server
   * flag and sends without it if generation fails. This connector cannot produce one.
   */
  antiAbuseToken?: Uint8Array;
}

export function encodeSignInGaia(i: SignInGaiaInput): Jspb {
  const device = jspb({
    1: b64(i.deviceId),
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

/** Mode 1: response f3 = repeated entries; each entry f1 decoded as UTF-8 text. */
export function decodeLookupResponse(v: unknown): string[] {
  const list = field(v, 3);
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new Error("SignInGaia lookup: f3 is not a list");
  return list.map((e) => {
    const id = utf8(field(e, 1));
    if (id === undefined) throw new Error("SignInGaia lookup: entry missing f1");
    return id;
  });
}

/** Mode 0: response f2 = UTF-8 ID string (matched against the lookup list), f4 = token {f1, f2 TTL µs}. */
export function decodeSignInResponse(v: unknown): { id: string; token: Token } {
  const id = utf8(field(v, 2));
  if (id === undefined) throw new Error("SignInGaia sign-in: response missing f2");
  return { id, token: tokenFromJspb(field(v, 4)) };
}
