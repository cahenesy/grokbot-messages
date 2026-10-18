import { afterEach, describe, expect, it } from "vitest";
import { PbWriter, decode, getMessage, getString, getVarint } from "../src/protocol/protobuf.js";
import { PairingEventError, encodeRevokeRelayPairing, pairedFromRelay, type PairedData } from "../src/protocol/pairing.js";
import { optionalEnvValue } from "../src/session/store.js";
import { InboundStream } from "../src/session/stream.js";
import { PairingPageServer } from "../src/pairing/pageServer.js";
import { QrPairing } from "../src/pairing/qrPairing.js";
import type { StreamElement } from "../src/transport/receive.js";

const id = (t: number, s: string) => new PbWriter().varint(1, t).string(2, s).string(3, "Bugle");
const route14Payload = (withF4 = true) =>
  withF4
    ? new PbWriter()
        .message(4, new PbWriter().message(1, id(1, "phone")).message(2, new PbWriter().bytes(1, new Uint8Array([8])).varint(2, 1000n)).message(3, id(16, "browser")).bytes(4, new Uint8Array(5)))
        .finish()
    : new PbWriter().message(6, new PbWriter()).finish();

describe("route-14 pairing event (A-017)", () => {
  it("decodes paired data from relay f12 (binary, clear) and reports f4.4 length", () => {
    const p = pairedFromRelay({ type: 14, envelope: route14Payload() })!;
    expect(p.phone.sourceId).toBe("phone");
    expect(p.browser.type).toBe(16);
    expect(p.token.ttlMicros).toBe(1000n);
    expect(p.f4Length).toBe(5);
    expect(pairedFromRelay({ type: 19, envelope: new Uint8Array() })).toBeUndefined();
  });

  it("route 14 without f4 fails pairing", () => {
    expect(() => pairedFromRelay({ type: 14, envelope: route14Payload(false) })).toThrow(PairingEventError);
    expect(() => pairedFromRelay({ type: 14 })).toThrow(PairingEventError);
  });

  it("RevokeRelayPairing carries the full browser identity in f2", () => {
    const f = decode(encodeRevokeRelayPairing({ type: 16, sourceId: "browser", network: "Bugle" }, new Uint8Array([1]), "rid"));
    const ident = getMessage(f, 2)!;
    expect(getVarint(ident, 1)).toBe(16n);
    expect(getString(ident, 2)).toBe("browser");
    expect(getString(getMessage(f, 1)!, 3)).toBe("Bugle");
  });
});

describe("optional settings (A-017 review note)", () => {
  it("treats empty and unexpanded placeholders as unset", () => {
    expect(optionalEnvValue({}, "X")).toBeUndefined();
    expect(optionalEnvValue({ X: "  " }, "X")).toBeUndefined();
    expect(optionalEnvValue({ X: "${GOOGLE_MESSAGES_PAGE_USER_AGENT}" }, "X")).toBeUndefined();
    expect(optionalEnvValue({ X: "$GOOGLE_MESSAGES_PAGE_USER_AGENT" }, "X")).toBeUndefined();
    expect(optionalEnvValue({ X: " Mozilla/5.0 test " }, "X")).toBe("Mozilla/5.0 test");
  });
});

describe("resume value (A-017 review note)", () => {
  it("uses the latest deduped relay f3, not the maximum", async () => {
    const bodies: unknown[] = [];
    let opens = 0;
    const ac = new AbortController();
    const relay = (i: string, ts: number) => ({ response: [null, [i, 19, String(ts)]] });
    const s = new InboundStream({
      auth: () => ({ network: "GDitto", requestId: "r" }),
      open: (body) => {
        bodies.push(body);
        if (++opens === 2) ac.abort();
        return (async function* (): AsyncGenerator<StreamElement> {
          if (opens === 1) {
            yield relay("a", 700);
            yield relay("b", 500);
            yield relay("a", 900); // duplicate: ignored for resume
          }
        })();
      },
      ack: async () => {},
      onRelay: () => {},
    });
    await s.run(ac.signal);
    expect((bodies[1] as unknown[])[3]).toEqual(["499"]);
  });
});

let page: PairingPageServer | undefined;
afterEach(async () => page?.close());

describe("late pairing is revoked (A-017)", () => {
  it("revokes and does not save when the link already expired", async () => {
    let now = 0;
    page = new PairingPageServer({ now: () => now });
    await page.start();
    let release!: (p: PairedData) => void;
    const saved: unknown[] = [];
    const revoked: PairedData[] = [];
    const relay = new PbWriter().bytes(3, new Uint8Array([1])).message(5, new PbWriter().bytes(1, new Uint8Array([9])).varint(2, 1n)).finish();
    const q = new QrPairing({
      page,
      now: () => now,
      registerPhoneRelay: async () => relay,
      waitForPaired: () => new Promise((r) => (release = r)),
      save: async (s) => void saved.push(s),
      revoke: async (p) => void revoked.push(p),
      userAgent: "t",
    });
    await q.start();
    now = 10 * 60_000; // past the link lifetime
    release(pairedFromRelay({ type: 14, envelope: route14Payload() })!);
    await new Promise((r) => setTimeout(r, 10));
    expect(revoked).toHaveLength(1);
    expect(saved).toHaveLength(0);
  });
});
