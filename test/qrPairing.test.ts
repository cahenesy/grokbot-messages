import { CONFIG_VERSION_2026_10_15 } from "../src/protocol/auth.js";
import { afterEach, describe, expect, it } from "vitest";
import { PairingPageServer } from "../src/pairing/pageServer.js";
import { QrPairing } from "../src/pairing/qrPairing.js";
import { PbWriter } from "../src/protocol/protobuf.js";
import type { PairedData } from "../src/protocol/pairing.js";
import type { SessionData } from "../src/session/store.js";

const relayResponse = new PbWriter()
  .bytes(3, new Uint8Array([1, 2, 3]))
  .message(5, new PbWriter().bytes(1, new Uint8Array([9])).varint(2, 86400000000n))
  .finish();
const paired: PairedData = {
  phone: { type: 1, sourceId: "phone", network: "Bugle" },
  browser: { type: 16, sourceId: "browser", network: "Bugle" },
  token: { token: new Uint8Array([7]), ttlMicros: 86400000000n },
};

let page: PairingPageServer | undefined;
afterEach(async () => page?.close());

const flush = () => new Promise((r) => setTimeout(r, 10));

describe("QrPairing", () => {
  it("returns only link + status; persists the session only after the phone confirms", async () => {
    page = new PairingPageServer();
    await page.start();
    let release!: (p: PairedData) => void;
    const saved: SessionData[] = [];
    const q = new QrPairing({
      page,
      registerPhoneRelay: async () => relayResponse,
      waitForPaired: () => new Promise((r) => (release = r)),
      save: async (s) => void saved.push(s),
      userAgent: "grokbot-messages/test",
      configVersion: async () => CONFIG_VERSION_2026_10_15,
    });
    const start = await q.start();
    expect(Object.keys(start).sort()).toEqual(["expiresAt", "link", "status"]);
    expect(start.status).toBe("waiting");
    expect(JSON.stringify(start)).not.toContain("#?c=");
    expect(saved).toHaveLength(0);

    release(paired);
    await flush();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.phone!.sourceId).toBe("phone");
    expect(q.status()).toBe("paired");
  });

  it("marks failed (status only) when the stream errors", async () => {
    page = new PairingPageServer();
    await page.start();
    const errors: unknown[] = [];
    const q = new QrPairing({
      page,
      registerPhoneRelay: async () => relayResponse,
      waitForPaired: async () => { throw new Error("boom"); },
      save: async () => {},
      userAgent: "t",
      configVersion: async () => CONFIG_VERSION_2026_10_15,
      onError: (e) => errors.push(e),
    });
    await q.start();
    await flush();
    expect(q.status()).toBe("failed");
    expect(errors).toHaveLength(1);
  });
});

describe("start failure (T-001 bug 2)", () => {
  it("reports failed when RegisterPhoneRelay fails before a link exists", async () => {
    page = new PairingPageServer();
    await page.start();
    const q = new QrPairing({
      page,
      registerPhoneRelay: async () => { throw new Error("HTTP 403"); },
      waitForPaired: () => new Promise(() => {}),
      save: async () => {},
      userAgent: "t",
      configVersion: async () => CONFIG_VERSION_2026_10_15,
    });
    await expect(q.start()).rejects.toThrow(/403/);
    expect(q.status()).toBe("failed");
  });
});
