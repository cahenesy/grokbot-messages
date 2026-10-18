// Messaging service messages, SPEC.md §6 and §8.

import { randomUUID } from "node:crypto";
import { authMessageJspb, deviceIdentityJspb, type AuthMessageInput, type DeviceIdentity } from "./auth.js";
import { b64, field, int64, jspb, unb64, type Jspb } from "./jspb.js";
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

/** Decodes an *outbound* envelope (§6.1(a) [B@367611]); used for round-trip tests. Inbound uses decodeResponseEnvelopePb. */
export function decodeOutboundEnvelopePb(b: Uint8Array): ActionEnvelope {
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
  };
}

/**
 * Inbound response envelope [B@368936] (A-015 item 2; corrects A-008 item 4): f1 request ID, f2 message,
 * f3 timestamp µs, f4 action, f5 plaintext, f6 bool, f7, f8 encrypted, f9 session preempted, f10, f11.
 */
export interface ResponseEnvelope {
  requestId: string;
  timestampMicros?: bigint;
  action: number;
  plaintext?: Uint8Array;
  encrypted?: Uint8Array;
  preempted: boolean;
}

export function decodeResponseEnvelopePb(b: Uint8Array): ResponseEnvelope {
  const f = decode(b);
  const requestId = getString(f, 1);
  if (requestId === undefined) throw new Error("response envelope missing request id");
  return {
    requestId,
    timestampMicros: getVarint(f, 3),
    action: Number(getVarint(f, 4) ?? 0n),
    plaintext: getBytes(f, 5),
    encrypted: getBytes(f, 8),
    preempted: getVarint(f, 9) === 1n,
  };
}

/** Actions whose responses arrive in the clear in f5; all others are decrypted from f8 [B@1069498], [B@1069778]. */
export const CLEAR_RESPONSE_ACTIONS: ReadonlySet<number> = new Set([44, 45, 47]);

/** Response payload: f5 for clear actions, else `decrypt(f8)`. (Action 16 with plaintext type 14 is also clear; not handled.) */
export function responsePayload(e: ResponseEnvelope, decrypt: (ciphertext: Uint8Array) => Uint8Array): Uint8Array {
  if (CLEAR_RESPONSE_ACTIONS.has(e.action)) {
    if (!e.plaintext) throw new Error(`action ${e.action} response missing plaintext`);
    return e.plaintext;
  }
  if (!e.encrypted) throw new Error(`action ${e.action} response missing ciphertext`);
  return decrypt(e.encrypted);
}

/** Inbound relay message (JSPB): f1 item ID ("tachyonId"), f2 type (handled only when 19), f7 time, f12 envelope bytes. */
export interface RelayMessage {
  id: string;
  type: number;
  timeMicros?: bigint;
  envelope?: Uint8Array;
}

export function decodeRelayMessageJspb(v: unknown): RelayMessage {
  const id = field(v, 1);
  const type = field(v, 2);
  const env = field(v, 12);
  const t = field(v, 7);
  if (typeof id !== "string") throw new Error("relay message missing id");
  return {
    id,
    type: Number(type ?? 0),
    timeMicros: typeof t === "string" || typeof t === "number" ? BigInt(t) : undefined,
    envelope: typeof env === "string" ? unb64(env) : undefined,
  };
}

/**
 * ReceiveMessages request [B@739513] (A-015 item 2): f1 AuthMessage, f4 {f1 start timestamp µs}.
 * Start = last seen − 1, else (server time ms − 60 000) × 1000 [B@735540]. f4 may be empty.
 */
export function encodeReceiveMessagesRequest(auth: AuthMessageInput, startMicros?: bigint): Jspb {
  return jspb({ 1: authMessageJspb(auth), 4: startMicros === undefined ? [] : [int64(startMicros)] });
}

export const defaultStreamStartMicros = (serverNowMs: number): bigint => BigInt(serverNowMs - 60_000) * 1000n;

/** Gaia-mode SendMessage f1 = the account's Id {16, email, "GDitto"} [B@1099025]. The email is personal data: never log it. */
export const gaiaAccountIdentity = (email: string): DeviceIdentity => ({ type: 16, sourceId: email, network: "GDitto" });

export interface SendMessageInput {
  auth: AuthMessageInput;
  destination: DeviceIdentity;
  envelope: ActionEnvelope;
  messageId?: string;
  qN?: number;
  deadlineMicros?: bigint;
  /** f9: repeated registration-ID targets (Gaia mode) [B@1098597]. JSPB bytes as base64 strings (UNVERIFIED, A-015). */
  targets?: Uint8Array[];
  /** How Message.f12 is carried inside JSPB (Q-008). */
  envelopeEncoding?: "pb-base64";
}

/**
 * JSPB SendMessage, §6.1(b) and A-015 item 1 [B@1079931]: f1 destination (QR: phone identity; Gaia: account Id),
 * f2 Message {f1 id, f2 19, f12 envelope, f23 [null, qN]}, f3 AuthMessage, f5 deadline µs, f9 targets.
 */
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
    9: i.targets?.length ? i.targets.map((t) => b64(t)) : undefined,
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
