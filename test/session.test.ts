import { describe, expect, it, vi } from "vitest";
import { RequestTimeoutError, RequestTracker } from "../src/session/requests.js";
import { TokenRefresher, isRetryable } from "../src/session/refresher.js";
import { RelayError } from "../src/transport/relay.js";
import { ConfirmationGate } from "../src/mcp/confirm.js";

describe("RequestTracker", () => {
  it("resolves by request id and ignores unknown ids", async () => {
    const t = new RequestTracker<string>();
    const p = t.wait("r1", 1, 1000);
    expect(t.resolve("nope", "x")).toBe(false);
    expect(t.resolve("r1", "ok")).toBe(true);
    await expect(p).resolves.toBe("ok");
  });

  it("times out", async () => {
    vi.useFakeTimers();
    const p = new RequestTracker<string>().wait("r", 2, 50);
    vi.advanceTimersByTime(60);
    await expect(p).rejects.toBeInstanceOf(RequestTimeoutError);
    vi.useRealTimers();
  });
});

describe("TokenRefresher", () => {
  it("schedules at 90% and backs off on retryable errors", async () => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    let calls = 0;
    const r = new TokenRefresher({
      now: () => 0,
      setTimer: (fn, ms) => (timers.push({ fn, ms }), { cancel() {} }),
      refresh: async () => {
        calls++;
        if (calls === 1) throw new RelayError(503, 14, "unavailable");
        return { receivedAtMs: 0, ttlMicros: 86400000000n };
      },
    });
    r.start({ receivedAtMs: 0, ttlMicros: 86400000000n });
    expect(timers[0]!.ms).toBe(0.9 * 86400000);
    timers[0]!.fn();
    await new Promise((res) => setImmediate(res));
    expect(timers[1]!.ms).toBe(1000);
    timers[1]!.fn();
    await new Promise((res) => setImmediate(res));
    expect(calls).toBe(2);
    expect(timers.length).toBe(3);
  });

  it("classifies retryable errors per §11", () => {
    expect(isRetryable(new RelayError(400, 3, ""))).toBe(false);
    expect(isRetryable(new RelayError(503, 14, ""))).toBe(true);
  });
});

describe("ConfirmationGate", () => {
  const send = { conversationId: "c1", text: "hi" };
  it("allows exactly one matching use", () => {
    const g = new ConfirmationGate();
    const { code } = g.prepare(send);
    expect(() => g.consume(code, { ...send, text: "changed" })).toThrow(/changed/);
    const { code: c2 } = g.prepare(send);
    expect(g.consume(c2, send)).toEqual(send);
    expect(() => g.consume(c2, send)).toThrow(/unknown/);
  });

  it("expires", () => {
    let now = 0;
    const g = new ConfirmationGate(1000, () => now);
    const { code } = g.prepare(send);
    now = 1001;
    expect(() => g.consume(code, send)).toThrow(/expired/);
  });
});
