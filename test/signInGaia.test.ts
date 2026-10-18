import { describe, expect, it } from "vitest";
import { PbWriter, decode, getBytes } from "../src/protocol/protobuf.js";
import {
  DEVICE_ID_PREFIX, SignInGaiaMode, choosePairingDestination, decodeLookupResponse, decodeSignInResponse, encodeSignInGaia, newDeviceIdString, newF36,
} from "../src/protocol/signInGaia.js";

const b64 = (b: Uint8Array | string) => Buffer.from(b).toString("base64");
const id36 = "0123456789abcdef0123456789abcdef0123"; // fixture, 36 chars

describe("SignInGaia (A-013)", () => {
  it("lookup request: f1 auth GDitto, f2 device {f1 = [3, 'messages-web-…']}, f3 = 1, f4 GDitto", () => {
    const deviceId = newDeviceIdString();
    expect(deviceId.startsWith(DEVICE_ID_PREFIX)).toBe(true);
    expect(deviceId).toBe(deviceId.toLowerCase());
    const r = encodeSignInGaia({ auth: { requestId: "r" }, mode: SignInGaiaMode.LOOKUP, deviceId });
    expect((r[0] as unknown[])[2]).toBe("GDitto");
    expect((r[1] as unknown[])[0]).toEqual([3, deviceId]);
    expect(r[2]).toBe(1);
    expect(r[3]).toBe("GDitto");
  });

  it("sign-in omits mode 0; f36 = serialized {f3: 32 bytes} (34 bytes, b64 length 48)", () => {
    const f36 = newF36();
    expect(f36.encoded.length).toBe(34);
    expect(b64(f36.encoded).length).toBe(48);
    expect(Buffer.from(getBytes(decode(f36.encoded), 3)!).equals(Buffer.from(f36.secret))).toBe(true);
    const r = encodeSignInGaia({ auth: { requestId: "r" }, mode: SignInGaiaMode.SIGN_IN, deviceId: "messages-web-x", f36: f36.encoded });
    expect(r[2]).toBeNull();
    expect((r[1] as unknown[])[35]).toBe(b64(f36.encoded));
    expect((r[1] as unknown[]).length).toBe(36); // no f39
  });

  it("decodes registrations and picks the enabled type-1/4 entry with the latest time", () => {
    const settings = (enabled: boolean, t: number) => b64(new PbWriter().varint(1, enabled).varint(2, t).finish());
    const entry = (id: string, type: number, s: string, last: number) => [b64(id), null, type, null, null, null, String(last), s];
    const regs = decodeLookupResponse([null, null, [
      entry("phone-old", 1, settings(true, 100), 5),
      entry("phone-new", 4, settings(true, 200), 5),
      entry("disabled", 1, settings(false, 999), 5),
      entry("other-type", 2, settings(true, 999), 5),
    ]]);
    expect(regs.map((r) => r.idText)).toEqual(["phone-old", "phone-new", "disabled", "other-type"]);
    expect(choosePairingDestination(regs, 10n)?.idText).toBe("phone-new");
    expect(choosePairingDestination(regs, 1_000n, 100n)).toBeUndefined(); // stale
    expect(decodeLookupResponse([])).toEqual([]);
  });

  it("decodes sign-in f2 text and f4 token", () => {
    const r = decodeSignInResponse([null, b64(id36), null, ["AQI=", "86400000000"]]);
    expect(r.id).toBe(id36);
    expect(r.token.ttlMicros).toBe(86400000000n);
  });
});
