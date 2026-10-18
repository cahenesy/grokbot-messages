// Messaging service messages, SPEC.md §6 and §8.

import { randomUUID } from "node:crypto";
import { authMessageJspb, deviceIdentityJspb, type AuthMessageInput, type DeviceIdentity } from "./auth.js";
import { b64, int64, jspb, type Jspb } from "./jspb.js";
import { PbWriter, decode, getBytes, getString, getVarint } from "./protobuf.js";
import { SpecGapError } from "./specGaps.js";

/** Message type for all phone-bound RPCs (§6.1(b), VERIFIED-LIVE). */
export const PHONE_RPC_MESSAGE_TYPE = 19;

export const DEADLINE_5_MIN_MICROS = 300_000_000n;
export const DEADLINE_24_H_MICROS = 86_400_000_000n;

/** Inner action envelope, §6.1(a). */
export interface ActionEnvelope {
  requestId: string; // f1
  action: number; // f2
  unencrypted?: Uint8Array; // f3 (empty string when encrypted)
  encrypted?: Uint8Array; // f5
  sessionId?: string; // f6
}

export function encodeEnvelopePb(e: ActionEnvelope): Uint8Array {
  const w = new PbWriter().string(1, e.requestId).varint(2, e.action).bytes(3, e.unencrypted ?? new Uint8Array());
  if (e.encrypted) w.bytes(5, e.encrypted);
  if (e.sessionId) w.string(6, e.sessionId);
  return w.finish();
}

export function decodeEnvelopePb(b: Uint8Array): ActionEnvelope & { preempted: boolean } {
  const f = decode(b);
  const requestId = getString(f, 1);
  const action = getVarint(f, 2);
  if (requestId === undefined || action === undefined) throw new Error("action envelope missing request id or action");
  const unencrypted = getBytes(f, 3);
  return {
    requestId,
    action: Number(action),
    unencrypted: unencrypted && unencrypted.length ? unencrypted : undefined,
    encrypted: getBytes(f, 5),
    sessionId: getString(f, 6),
    preempted: getVarint(f, 9) === 1n, // §6.2
  };
}

export interface SendMessageInput {
  auth: AuthMessageInput;
  destination: DeviceIdentity;
  envelope: ActionEnvelope;
  messageId?: string;
  qN?: number;
  deadlineMicros?: bigint;
  /** How Message.f12 is carried inside JSPB (Q-008). */
  envelopeEncoding?: "pb-base64";
}

/** JSPB SendMessage, §6.1(b): f1 destination, f2 Message, f3 AuthMessage, f5 deadline. */
export function encodeSendMessage(i: SendMessageInput): Jspb {
  if (i.envelopeEncoding === undefined || i.qN === undefined) throw new SpecGapError("Q-008");
  const message = jspb({
    1: i.messageId ?? randomUUID(),
    2: PHONE_RPC_MESSAGE_TYPE,
    12: b64(encodeEnvelopePb(i.envelope)),
    23: [null, i.qN],
  });
  return jspb({
    1: deviceIdentityJspb(i.destination),
    2: message,
    3: authMessageJspb(i.auth),
    5: i.deadlineMicros === undefined ? undefined : int64(i.deadlineMicros),
  });
}

/** AckMessages request, §8: [AuthMessage, [messageId, ...]] (VERIFIED-LIVE). */
export function encodeAckMessages(auth: AuthMessageInput, messageIds: string[]): Jspb {
  if (messageIds.length === 0) throw new RangeError("nothing to ack");
  return [authMessageJspb(auth), [...messageIds]];
}

/** Action numbers referenced by the connector (§7). */
export const Action = {
  LIST_CONVERSATIONS: 1,
  LIST_MESSAGES: 2,
  SEND_MESSAGE: 3,
  GET_OR_CREATE_CONVERSATION: 9,
  ACTIVATE_SESSION: 16,
  ACK: 17,
  TYPING: 22,
  GET_CAPABILITIES: 31,
  SEND_REACTION: 38,
} as const;
