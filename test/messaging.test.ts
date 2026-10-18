import { describe, expect, it } from "vitest";
import { Action, decodeEnvelopePb, encodeAckMessages, encodeEnvelopePb, encodeSendMessage } from "../src/protocol/messaging.js";
import { SpecGapError } from "../src/protocol/specGaps.js";

const env = { requestId: "r".repeat(36), action: Action.SEND_MESSAGE, encrypted: new Uint8Array(295), sessionId: "s".repeat(36) };
const dest = { type: 1, sourceId: "phone", network: "Bugle" };

describe("action envelope", () => {
  it("round-trips f1/f2/f5/f6 with empty f3 when encrypted", () => {
    const d = decodeEnvelopePb(encodeEnvelopePb(env));
    expect(d).toMatchObject({ requestId: env.requestId, action: 3, sessionId: env.sessionId, preempted: false });
    expect(d.unencrypted).toBeUndefined();
    expect(d.encrypted!.length).toBe(295);
  });
});

describe("SendMessage", () => {
  it("refuses until Q-008 settles envelope encoding and qN", () => {
    expect(() => encodeSendMessage({ auth: { network: "Bugle" }, destination: dest, envelope: env })).toThrow(SpecGapError);
  });

  it("places destination, Message type 19, f12, f23 and deadline", () => {
    const m = encodeSendMessage({
      auth: { network: "Bugle", requestId: "a" },
      destination: dest,
      envelope: env,
      messageId: "m",
      qN: 2,
      deadlineMicros: 300000000n,
      envelopeEncoding: "pb-base64",
    });
    expect(m[0]).toEqual([1, "phone", "Bugle"]);
    const msg = m[1] as unknown[];
    expect(msg[0]).toBe("m");
    expect(msg[1]).toBe(19);
    expect(typeof msg[11]).toBe("string");
    expect(msg[22]).toEqual([null, 2]);
    expect(m[4]).toBe("300000000");
  });
});

describe("AckMessages", () => {
  it("is [AuthMessage, ids]", () => {
    expect(encodeAckMessages({ network: "Bugle", requestId: "a" }, ["x", "y"])).toEqual([["a", null, "Bugle"], ["x", "y"]]);
    expect(() => encodeAckMessages({ network: "Bugle" }, [])).toThrow();
  });
});
