// Phone-bound action client (SPEC §6–§8; A-015, A-016, A-018, A-019).
// Sends actions via Messaging/SendMessage, runs the inbound stream, matches responses by envelope f1,
// routes push updates (action 16 under the session ID), and answers ack requests with action 17.

import { randomUUID } from "node:crypto";
import { decryptPayload, encryptPayload, type PayloadKeys } from "../crypto/payload.js";
import { CONFIG_VERSION_2026_10_15, type AuthMessageInput, type DeviceIdentity } from "../protocol/auth.js";
import {
  Action, CLEAR_RESPONSE_ACTIONS, DEADLINE_24_H_MICROS, DEADLINE_5_MIN_MICROS, PHONE_RPC_MESSAGE_TYPE, decodeResponseEnvelopePb, encodeSendMessage, responsePayload,
  type RelayMessage, type ResponseEnvelope,
} from "../protocol/messaging.js";
import {
  EMPTY_REQUEST, decodeCapabilities, decodeListConversations, decodeListMessages, encodeActivateSession, encodeListConversations, encodeListMessages,
  type Cursor,
} from "../actions/requests.js";
import { PUSH_UPDATE_ACTION, decodePushUpdate, type PushUpdate } from "../actions/updates.js";
import type { StreamElement } from "../transport/receive.js";
import { RequestTracker } from "./requests.js";
import { InboundStream } from "./stream.js";

export type Mode = { kind: "qr"; phone: DeviceIdentity } | { kind: "gaia"; account: DeviceIdentity; destination: Uint8Array };

export interface ClientDeps {
  mode: Mode;
  keys: PayloadKeys;
  token: () => Uint8Array;
  sendMessage: (body: unknown) => Promise<unknown>;
  ack: (body: unknown) => Promise<unknown>;
  openStream: (body: unknown, signal: AbortSignal) => AsyncIterable<StreamElement>;
  onPushUpdate?: (u: PushUpdate) => void;
  /** Kind-only diagnostics; never contents. */
  onEvent?: (e: { kind: string; detail?: string | number }) => void;
  nowMs?: () => number;
  requestTimeoutMs?: number;
}

/** Actions whose reply may legitimately be empty (proto3 all-defaults), e.g. capabilities = false. */
const EMPTY_REPLY_OK: ReadonlySet<number> = new Set([Action.GET_CAPABILITIES]);

/** READ actions take the 24 h deadline, WRITEs 5 min (INFERRED working rule, A-008). */
const READ_ACTIONS: ReadonlySet<number> = new Set([Action.LIST_CONVERSATIONS, Action.LIST_MESSAGES, Action.ACTIVATE_SESSION, Action.GET_CAPABILITIES]);

export class MessagesClient {
  readonly sessionId = randomUUID();
  private readonly tracker = new RequestTracker<ResponseEnvelope>();
  private readonly abort = new AbortController();
  private firstListConversations = true;
  private streamDone?: Promise<void>;

  constructor(private readonly d: ClientDeps) {}

  private auth(): AuthMessageInput {
    return { network: this.d.mode.kind === "qr" ? "Bugle" : "GDitto", token: this.d.token(), configVersion: CONFIG_VERSION_2026_10_15 };
  }

  /** Opens the stream, then activates the session: action 16 (request ID = session ID), then 31 (SPEC §8, A-018). */
  async start(): Promise<{ canSend: boolean }> {
    const stream = new InboundStream({
      auth: () => this.auth(),
      open: (body, signal) => this.d.openStream(body, signal),
      ack: (body) => this.d.ack(body),
      onRelay: (m) => this.onRelay(m),
      onEvent: (e) => this.d.onEvent?.({ kind: `stream-${e.kind}`, detail: e.detail }),
    });
    this.streamDone = stream.run(this.abort.signal).catch((e) => {
      this.d.onEvent?.({ kind: "stream-failed", detail: (e as Error)?.name });
      this.tracker.rejectAll(e as Error);
    });
    await this.send(Action.ACTIVATE_SESSION, encodeActivateSession(BigInt((this.d.nowMs ?? Date.now)())), { requestId: this.sessionId, expectResponse: false });
    return decodeCapabilities(await this.call(Action.GET_CAPABILITIES, EMPTY_REQUEST));
  }

  async stop(): Promise<void> {
    this.abort.abort();
    this.tracker.rejectAll(new Error("client stopped"));
    await this.streamDone;
  }

  async listConversations(cursor?: Cursor) {
    return decodeListConversations(await this.call(Action.LIST_CONVERSATIONS, encodeListConversations({ cursor })));
  }

  async listMessages(conversationId: string, cursor?: Cursor) {
    return decodeListMessages(await this.call(Action.LIST_MESSAGES, encodeListMessages({ conversationId, cursor })));
  }

  /**
   * Sends one encrypted action and resolves with its authenticated, decrypted response plaintext. The reply
   * must carry the same action; empty (unauthenticated) replies are accepted only for actions listed in
   * EMPTY_REPLY_OK, where an all-defaults message is a legitimate answer.
   */
  async call(action: number, plaintext: Uint8Array): Promise<Uint8Array> {
    const env = await this.send(action, plaintext, { expectResponse: true });
    if (CLEAR_RESPONSE_ACTIONS.has(action)) throw new Error("clear actions are not sent through call()");
    return responsePayload(env!, (ct) => decryptPayload(this.d.keys, ct, { allowEmpty: EMPTY_REPLY_OK.has(action) }), action);
  }

  private async send(action: number, plaintext: Uint8Array, o: { requestId?: string; expectResponse: boolean }): Promise<ResponseEnvelope | undefined> {
    const requestId = o.requestId ?? randomUUID();
    const pending = o.expectResponse ? this.tracker.wait(requestId, action, this.d.requestTimeoutMs ?? 60_000) : undefined;
    let qN: number | null = 2; // [B@1079931]
    if (action === Action.LIST_CONVERSATIONS) {
      qN = this.firstListConversations ? 16 : null; // 16 on the session's first action 1, unset afterwards (A-018)
      this.firstListConversations = false;
    }
    const mode = this.d.mode;
    try {
      await this.d.sendMessage(
        encodeSendMessage({
          auth: this.auth(),
          destination: mode.kind === "qr" ? mode.phone : mode.account,
          targets: mode.kind === "gaia" ? [mode.destination] : undefined,
          envelope: { requestId, action, encrypted: encryptPayload(this.d.keys, plaintext), sessionId: this.sessionId },
          qN,
          deadlineMicros: READ_ACTIONS.has(action) ? DEADLINE_24_H_MICROS : DEADLINE_5_MIN_MICROS,
          envelopeEncoding: "pb-base64",
        }),
      );
    } catch (e) {
      if (pending) {
        pending.catch(() => {}); // the caller gets the send error below
        this.tracker.reject(requestId, e as Error);
      }
      throw e;
    }
    return pending;
  }

  private async onRelay(m: RelayMessage): Promise<void> {
    if (m.type !== PHONE_RPC_MESSAGE_TYPE || !m.envelope) return;
    const env = decodeResponseEnvelopePb(m.envelope);
    if (env.preempted) this.d.onEvent?.({ kind: "session-preempted" });
    if (env.action === PUSH_UPDATE_ACTION && env.requestId === this.sessionId) {
      let update: PushUpdate;
      try {
        // Push updates must be authenticated: require f8 ciphertext, no empty passthrough.
        update = decodePushUpdate(responsePayload(env, (ct) => decryptPayload(this.d.keys, ct), PUSH_UPDATE_ACTION));
      } catch (e) {
        this.d.onEvent?.({ kind: "push-decode-failed", detail: (e as Error)?.name });
        return;
      }
      if (update.kind === "ack-request") await this.send(Action.ACK, EMPTY_REQUEST, { expectResponse: false });
      this.d.onPushUpdate?.(update);
      return;
    }
    if (!this.tracker.resolve(env.requestId, env)) this.d.onEvent?.({ kind: "unmatched-response", detail: env.action });
  }
}
