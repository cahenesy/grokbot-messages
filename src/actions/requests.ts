// Plaintext request/response layouts for the read-only action set (spec answer A-018 on #9).
// Plaintext is binary protobuf, proto3-style (defaults not written) [B@39701], [B@39414].

import { PbWriter, decode, getBytes, getAllMessages, getVarint, type RawField } from "../protocol/protobuf.js";
import { decodeConversation, decodeMessage, type Conversation, type Message } from "./models.js";

/** Action 16 request: f2 = int64 ms (Date.now() + server-clock offset) [B@1053783], [B@1042865]. No response type. */
export const encodeActivateSession = (nowMs: bigint): Uint8Array => new PbWriter().varint(2, nowMs).finish();

/** Action 31 request: empty [B@377954] (so envelope f5 is empty, A-018 item 5). Action 17 (ack) is also empty. */
export const EMPTY_REQUEST = new Uint8Array();

/** Action 31 response: f1 bool gates send / create-conversation / group features [B@378030]. */
export function decodeCapabilities(b: Uint8Array): { canSend: boolean } {
  return { canSend: getVarint(decode(b), 1) === 1n };
}

/** Opaque pagination cursor {f1 string, f2 int64} [B@379210]; sent back unchanged. */
export type Cursor = Uint8Array;

/** Conversation-list filter: the startup inbox load uses 1 [P@471276]; other values {2, 3, 5, 6, 8} UNVERIFIED. */
export const CONVERSATION_FILTER_INBOX = 1;
export const LIST_CONVERSATIONS_COUNT = 25; // [B@379247]
export const LIST_MESSAGES_COUNT = 50; // [B@379980]

/** Action 1 request [B@379448]: f2 count 25, f4 filter, f5 cursor (omit on the first page). */
export function encodeListConversations(o: { filter?: number; cursor?: Cursor } = {}): Uint8Array {
  const w = new PbWriter().varint(2, LIST_CONVERSATIONS_COUNT).varint(4, o.filter ?? CONVERSATION_FILTER_INBOX);
  if (o.cursor?.length) w.bytes(5, o.cursor);
  return w.finish();
}

/** Action 1 response [B@379558]: f2 repeated Conversation, f5 cursor. */
export function decodeListConversations(b: Uint8Array): { conversations: Conversation[]; cursor?: Cursor } {
  const f = decode(b);
  return { conversations: getAllMessages(f, 2).map(decodeConversation), cursor: nonEmpty(getBytes(f, 5)) };
}

/** Action 2 request [B@380162]: f2 conversation ID, f3 count 50, f5 cursor, f6 conversation reference {f1 ID}. */
export function encodeListMessages(o: { conversationId: string; cursor?: Cursor }): Uint8Array {
  const w = new PbWriter().string(2, o.conversationId).varint(3, LIST_MESSAGES_COUNT);
  if (o.cursor?.length) w.bytes(5, o.cursor);
  return w.message(6, new PbWriter().string(1, o.conversationId)).finish();
}

/** Action 2 response [B@380356]: f2 repeated Message, f5 cursor. An empty first page means "Conversation not found". */
export function decodeListMessages(b: Uint8Array): { messages: Message[]; cursor?: Cursor } {
  const f = decode(b);
  return { messages: getAllMessages(f, 2).map(decodeMessage), cursor: nonEmpty(getBytes(f, 5)) };
}

const nonEmpty = (b: Uint8Array | undefined) => (b && b.length ? b : undefined);

export type { RawField };
