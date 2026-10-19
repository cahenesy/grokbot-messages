import { describe, expect, it } from "vitest";
import { Action, decodeOutboundEnvelopePb, encodeAckMessages, encodeEnvelopePb, encodeSendMessage } from "../src/protocol/messaging.js";
import { SpecGapError } from "../src/protocol/specGaps.js";

const env = { requestId: "r".repeat(36), action: Action.SEND_MESSAGE, encrypted: new Uint8Array(295), sessionId: "s".repeat(36) };
const dest = { type: 1, sourceId: "phone", network: "Bugle" };

describe("action envelope", () => {
  it("round-trips f1/f2/f5/f6 with empty f3 when encrypted", () => {
    const d = decodeOutboundEnvelopePb(encodeEnvelopePb(env));
    expect(d).toMatchObject({ requestId: env.requestId, action: 3, sessionId: env.sessionId });
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

import { PbWriter } from "../src/protocol/protobuf.js";
import {
  decodeRelayMessageJspb, decodeResponseEnvelopePb, defaultStreamStartMicros, encodeReceiveMessagesRequest, gaiaAccountIdentity, responsePayload,
} from "../src/protocol/messaging.js";

describe("A-015 inbound and Gaia addressing", () => {
  it("decodes the inbound response envelope (f4 action, f5 clear, f8 encrypted, f9 preempted)", () => {
    const b = new PbWriter().string(1, "req").varint(3, 123n).varint(4, 44).bytes(5, new Uint8Array([1])).bytes(8, new Uint8Array([2])).varint(9, true).finish();
    const e = decodeResponseEnvelopePb(b);
    expect(e).toMatchObject({ requestId: "req", action: 44, preempted: true, timestampMicros: 123n });
    expect([...responsePayload(e, () => { throw new Error("must not decrypt"); })]).toEqual([1]);
    const enc = decodeResponseEnvelopePb(new PbWriter().string(1, "r").varint(4, 1).bytes(8, new Uint8Array([9])).finish());
    expect([...responsePayload(enc, (ct) => ct.map((x) => x + 1))]).toEqual([10]);
  });

  it("decodes a JSPB relay message (f1 id, f2 type, f7 time, f12 envelope)", () => {
    const m = decodeRelayMessageJspb(["tid", 19, null, null, null, null, "77", null, null, null, null, Buffer.from([5]).toString("base64")]);
    expect(m).toEqual({ id: "tid", type: 19, timeMicros: 77n, envelope: new Uint8Array([5]) });
  });

  it("ReceiveMessages body: [AuthMessage, , , [start µs]]; default start = (now − 60 s) × 1000", () => {
    const r = encodeReceiveMessagesRequest({ network: "GDitto", requestId: "a" }, 5n);
    expect(r[3]).toEqual(["5"]);
    expect(encodeReceiveMessagesRequest({ network: "GDitto", requestId: "a" })[3]).toEqual([]);
    expect(defaultStreamStartMicros(100_000)).toBe(40_000_000n);
  });

  it("Gaia SendMessage: f1 account Id {16, email, GDitto}, f9 registration targets", () => {
    const m = encodeSendMessage({
      auth: { network: "GDitto", requestId: "a" },
      destination: gaiaAccountIdentity("user@example.invalid"),
      envelope: { requestId: "r", action: 44, unencrypted: new Uint8Array([1]) },
      qN: 20,
      deadlineMicros: 300_000_000n,
      targets: [new TextEncoder().encode("reg-1"), new TextEncoder().encode("reg-2")],
      envelopeEncoding: "pb-base64",
    });
    expect(m[0]).toEqual([16, "user@example.invalid", "GDitto"]);
    expect(m[8]).toEqual([Buffer.from("reg-1").toString("base64"), Buffer.from("reg-2").toString("base64")]);
    expect((m[1] as unknown[])[22]).toEqual([null, 20]);
  });
});

import { RelayDedup, decodeReceiveMessagesResponse } from "../src/protocol/messaging.js";

describe("ReceiveMessages response (A-016)", () => {
  it("decodes the oneof: f2 relay, f3 heartbeat, f4/f5 batch, f6/f7 unknown", () => {
    const relay = decodeReceiveMessagesResponse([null, ["id1", 19, "99"]]);
    expect(relay).toMatchObject({ kind: "relay", relay: { id: "id1", type: 19, timestamp: 99n } });
    expect(decodeReceiveMessagesResponse([null, null, []]).kind).toBe("heartbeat");
    expect(decodeReceiveMessagesResponse([null, null, null, []]).kind).toBe("batch-start");
    expect(decodeReceiveMessagesResponse([null, null, null, null, []]).kind).toBe("batch-end");
    expect(decodeReceiveMessagesResponse([null, null, null, null, null, null, []])).toEqual({ kind: "unknown", oneofCase: 7 });
    expect(decodeReceiveMessagesResponse([[]]).kind).toBe("empty");
  });

  it("dedups relay ids in a bounded LRU", () => {
    const d = new RelayDedup(2);
    expect(d.firstSighting("a")).toBe(true);
    expect(d.firstSighting("a")).toBe(false);
    d.firstSighting("b");
    d.firstSighting("c"); // evicts the least recently used ("a")
    expect(d.firstSighting("a")).toBe(true);
  });
});

describe("response authentication (security review)", () => {
  const clearForged = { requestId: "r", action: 44, plaintext: new Uint8Array([1]), preempted: false };
  it("rejects a reply whose action differs from the request's", () => {
    expect(() => responsePayload(clearForged, () => new Uint8Array(), 1)).toThrow(/does not match/);
  });
  it("still accepts clear payloads for clear requests", () => {
    expect([...responsePayload(clearForged, () => { throw new Error("no"); }, 44)]).toEqual([1]);
  });
});
