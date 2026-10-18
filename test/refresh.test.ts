import { describe, expect, it } from "vitest";
import { DeviceKey } from "../src/crypto/deviceKey.js";
import { decodeRegisterRefreshResponse, encodeRegisterRefresh } from "../src/protocol/refresh.js";
import { backoffMs, needsPreCallRefresh, refreshAtMs } from "../src/session/schedule.js";

describe("RegisterRefresh", () => {
  it("signs \"<requestId>:<timestamp>\" and places fields 1–4", () => {
    const key = DeviceKey.generate();
    const req = encodeRegisterRefresh({
      auth: { requestId: "rid", network: "Bugle", token: new Uint8Array([1]) },
      browser: { type: 16, sourceId: "s", network: "Bugle" },
      key,
      nowMicros: 1760000000000000n,
    });
    expect(req[1]).toEqual([16, "s", "Bugle"]);
    expect(req[2]).toBe("1760000000000000");
    const sig = new Uint8Array(Buffer.from(req[3] as string, "base64"));
    expect(sig.length).toBe(64);
    expect(key.verify("rid:1760000000000000", sig)).toBe(true);
  });

  it("decodes a new token and the clock-rejected branch", () => {
    expect(decodeRegisterRefreshResponse([null, ["AQ==", "86400000000"]])).toMatchObject({ kind: "ok" });
    expect(decodeRegisterRefreshResponse([null, null, true, "123"])).toEqual({ kind: "clock-rejected", serverTimeMicros: 123n });
  });
});

describe("refresh schedule", () => {
  const t = { receivedAtMs: 0, ttlMicros: 86400000000n }; // 24 h
  it("refreshes at 90% and pre-call at 95%", () => {
    expect(refreshAtMs(t)).toBe(0.9 * 86400000);
    expect(needsPreCallRefresh(t, 0.94 * 86400000)).toBe(false);
    expect(needsPreCallRefresh(t, 0.95 * 86400000)).toBe(true);
    expect(backoffMs(3)).toBe(8000);
  });
});
