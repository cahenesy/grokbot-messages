import { describe, expect, it } from "vitest";
import { InboundStream } from "../src/session/stream.js";
import { RelayError } from "../src/transport/relay.js";
import type { StreamElement } from "../src/transport/receive.js";

const relay = (id: string, ts: number) => ({ response: [null, [id, 19, String(ts)]] });

describe("InboundStream", () => {
  it("dedups, acks, ignores markers, and resumes from last seen − 1 after a retryable error", async () => {
    const bodies: unknown[] = [];
    const acked: unknown[] = [];
    const got: string[] = [];
    let opens = 0;
    const ac = new AbortController();
    const s = new InboundStream({
      auth: () => ({ network: "GDitto", requestId: "r" }),
      nowMs: () => 1_000_000,
      open: (body) => {
        bodies.push(body);
        opens++;
        if (opens === 1) {
          return (async function* (): AsyncGenerator<StreamElement> {
            yield relay("a", 500);
            yield { response: [null, null, []] }; // heartbeat
            yield relay("a", 500); // duplicate
            yield relay("b", 700);
            throw new RelayError(503, 14, "unavailable");
          })();
        }
        ac.abort();
        return (async function* (): AsyncGenerator<StreamElement> {})();
      },
      ack: async (b) => void acked.push(b),
      onRelay: (m) => void got.push(m.id),
      sleep: async () => {},
    });
    await s.run(ac.signal);
    expect(got).toEqual(["a", "b"]);
    expect(acked).toHaveLength(2);
    expect((bodies[0] as unknown[])[3]).toEqual([String((1_000_000n - 60_000n) * 1000n)]);
    expect((bodies[1] as unknown[])[3]).toEqual(["699"]);
  });

  it("rethrows non-retryable errors", async () => {
    const s = new InboundStream({
      auth: () => ({ network: "GDitto" }),
      open: () => (async function* (): AsyncGenerator<StreamElement> { throw new RelayError(401, 16, "unauthenticated"); })(),
      ack: async () => {},
      onRelay: () => {},
    });
    await expect(s.run(new AbortController().signal)).rejects.toBeInstanceOf(RelayError);
  });
});
