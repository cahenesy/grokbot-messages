// Registration/RegisterRefresh, SPEC.md §4.3. Registration client uses JSPB.

import type { DeviceKey, SignatureEncoding } from "../crypto/deviceKey.js";
import { authMessageJspb, deviceIdentityJspb, tokenFromJspb, type AuthMessageInput, type DeviceIdentity, type Token } from "./auth.js";
import { b64, field, int64, jspb, type Jspb } from "./jspb.js";

export interface RegisterRefreshInput {
  auth: AuthMessageInput & { requestId: string };
  browser: DeviceIdentity;
  key: DeviceKey;
  nowMicros: bigint;
  signatureEncoding?: SignatureEncoding;
}

/** Signs UTF-8 "<requestId>:<timestamp>" with the device key. */
export function encodeRegisterRefresh(i: RegisterRefreshInput): Jspb {
  const sig = i.key.sign(`${i.auth.requestId}:${i.nowMicros}`, i.signatureEncoding);
  return jspb({
    1: authMessageJspb(i.auth),
    2: deviceIdentityJspb(i.browser),
    3: int64(i.nowMicros),
    4: b64(sig),
  });
}

export type RegisterRefreshResult =
  | { kind: "ok"; token: Token; extra?: string }
  | { kind: "clock-rejected"; serverTimeMicros: bigint };

export function decodeRegisterRefreshResponse(v: unknown): RegisterRefreshResult {
  if (field(v, 3) === true) {
    const t = field(v, 4);
    if (typeof t !== "string" && typeof t !== "number") throw new Error("timestamp rejected without server time");
    return { kind: "clock-rejected", serverTimeMicros: BigInt(t) };
  }
  const extra = field(v, 8);
  return { kind: "ok", token: tokenFromJspb(field(v, 2)), extra: typeof extra === "string" ? extra : undefined };
}
