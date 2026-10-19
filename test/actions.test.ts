import { describe, expect, it } from "vitest";
import { PbWriter, decode, getBytes, getMessage, getString, getVarint } from "../src/protocol/protobuf.js";
import {
  decodeCapabilities, decodeListConversations, decodeListMessages, encodeActivateSession, encodeListConversations, encodeListMessages,
} from "../src/actions/requests.js";
import { messageText } from "../src/actions/models.js";
import { StaleUpdateFilter, decodePushUpdate } from "../src/actions/updates.js";

// Fixture values only (no real people).
const participant = (id: string, name: string, self = false) =>
  new PbWriter().message(1, new PbWriter().varint(1, 1).string(2, id)).string(15, name).varint(6, self).message(7, new PbWriter());
const conversation = new PbWriter()
  .string(1, "c1").string(2, "Test Thread")
  .message(4, new PbWriter().string(1, "hi").varint(2, true).message(5, new PbWriter().varint(2, 2)))
  .varint(5, 1_760_000_000_000_000n).varint(6, 2).varint(10, false).varint(12, 1)
  .message(20, participant("+15550000001", "Alice Fixture"))
  .message(20, participant("+15550000002", "Me", true));
const textPart = (t: string) => new PbWriter().string(1, "p").message(2, new PbWriter().string(1, t));
const message = (id: string, code: number) =>
  new PbWriter().string(1, id).message(4, new PbWriter().varint(2, code)).varint(5, 1_760_000_000_123_000n).string(7, "c1").string(9, "+15550000001")
    .message(10, textPart("hello")).message(10, textPart("world"));

describe("requests (A-018)", () => {
  it("action 16: f2 = ms timestamp", () => {
    expect(getVarint(decode(encodeActivateSession(1_760_000_000_000n)), 2)).toBe(1_760_000_000_000n);
  });
  it("action 31 response: f1 bool", () => {
    expect(decodeCapabilities(new PbWriter().varint(1, true).finish())).toEqual({ canSend: true });
    expect(decodeCapabilities(new Uint8Array())).toEqual({ canSend: false });
  });
  it("action 1: f2 = 25, f4 filter, f5 cursor only when paging", () => {
    const first = decode(encodeListConversations());
    expect(getVarint(first, 2)).toBe(25n);
    expect(getVarint(first, 4)).toBe(1n);
    expect(getBytes(first, 5)).toBeUndefined();
    expect([...getBytes(decode(encodeListConversations({ cursor: new Uint8Array([7]) })), 5)!]).toEqual([7]);
  });
  it("action 2: f2 conversation, f3 = 50, f6 {f1 conversation}", () => {
    const f = decode(encodeListMessages({ conversationId: "c1" }));
    expect(getString(f, 2)).toBe("c1");
    expect(getVarint(f, 3)).toBe(50n);
    expect(getString(getMessage(f, 6)!, 1)).toBe("c1");
  });
});

describe("models (A-019)", () => {
  it("decodes a conversation list with participants and preview", () => {
    const resp = new PbWriter().message(2, conversation).bytes(5, new Uint8Array([1, 2])).finish();
    const { conversations, cursor } = decodeListConversations(resp);
    const c = conversations[0]!;
    expect(c).toMatchObject({ id: "c1", name: "Test Thread", lastActivityMs: 1_760_000_000_000, unread: 2, isGroup: false, status: 1 });
    expect(c.participants.map((p) => [p.id, p.displayName, p.isSelf])).toEqual([["+15550000001", "Alice Fixture", false], ["+15550000002", "Me", true]]);
    expect(c.preview).toEqual({ text: "hi", outgoing: true, statusCode: 2 });
    expect([...cursor!]).toEqual([1, 2]);
  });

  it("decodes messages: status f4.f2, direction by code range, text parts in order", () => {
    const { messages } = decodeListMessages(new PbWriter().message(2, message("m1", 2)).message(2, message("m2", 100)).finish());
    expect(messages[0]).toMatchObject({ id: "m1", statusCode: 2, outgoing: true, conversationId: "c1", timestampMs: 1_760_000_000_123 });
    expect(messages[1]!.outgoing).toBe(false);
    expect(messageText(messages[0]!)).toBe("hello\nworld");
  });

  it("special messages render no parts", () => {
    const { messages } = decodeListMessages(new PbWriter().message(2, message("m3", 205)).finish());
    expect(messages[0]!.special).toBe(true);
    expect(messages[0]!.parts).toEqual([]);
  });
});

describe("push updates (A-019)", () => {
  it("decodes the oneof: f3 message update, f2 conversation update, f6 alert, f7 ack request", () => {
    const msgUpdate = new PbWriter().message(3, new PbWriter().message(2, message("m1", 100))).finish();
    const u = decodePushUpdate(msgUpdate);
    expect(u.kind).toBe("messages");
    expect(u.kind === "messages" && u.messages[0]!.id).toBe("m1");
    expect(decodePushUpdate(new PbWriter().message(2, new PbWriter().message(2, conversation)).finish()).kind).toBe("conversations");
    expect(decodePushUpdate(new PbWriter().message(6, new PbWriter().varint(2, 1)).finish())).toEqual({ kind: "alert", type: 1 });
    expect(decodePushUpdate(new PbWriter().message(7, new PbWriter()).finish()).kind).toBe("ack-request");
  });

  it("drops stale updates per key", () => {
    const s = new StaleUpdateFilter();
    expect(s.accept("msg_m1", 10n)).toBe(true);
    expect(s.accept("msg_m1", 5n)).toBe(false);
    expect(s.accept("msg_m1", 11n)).toBe(true);
  });
});

import { isRenderable, type Message } from "../src/actions/models.js";

describe("placeholder rule (A-020)", () => {
  const base: Message = { id: "m", outgoing: false, parts: [], special: false };
  it("renders status 300, type 3 with status ≠ 105, or all parts with content", () => {
    expect(isRenderable({ ...base, statusCode: 300, parts: [{ kind: "other" }] })).toBe(true);
    expect(isRenderable({ ...base, type: 3, statusCode: 100, parts: [{ kind: "other" }] })).toBe(true);
    expect(isRenderable({ ...base, type: 3, statusCode: 105, parts: [{ kind: "other" }] })).toBe(false);
    expect(isRenderable({ ...base, statusCode: 100, parts: [{ kind: "text", text: "x" }] })).toBe(true);
    expect(isRenderable({ ...base, statusCode: 100, parts: [{ kind: "text", text: "x" }, { kind: "other" }] })).toBe(false);
  });
});
