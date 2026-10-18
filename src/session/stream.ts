// Long-lived inbound stream (SPEC §3, §6.2, §8; A-015, A-016).
// Opens ReceiveMessages, decodes each element's oneof, dedups relay messages, acks them, tracks the
// last-seen relay f3 for resuming (last seen − 1), and reconnects with backoff on retryable errors.

import { RelayDedup, decodeReceiveMessagesResponse, defaultStreamStartMicros, encodeAckMessages, encodeReceiveMessagesRequest, type RelayMessage } from "../protocol/messaging.js";
import type { AuthMessageInput } from "../protocol/auth.js";
import type { StreamElement } from "../transport/receive.js";
import { isRetryable } from "./refresher.js";
import { backoffMs } from "./schedule.js";

export interface StreamDeps {
  /** Builds the AuthMessage for each call (fresh request ID, current token). */
  auth: () => AuthMessageInput;
  /** Opens one ReceiveMessages stream with the given body. */
  open: (body: unknown, signal: AbortSignal) => AsyncIterable<StreamElement>;
  /** Messaging/AckMessages with the given body. */
  ack: (body: unknown) => Promise<unknown>;
  /** Handles one relay message (already de-duplicated). */
  onRelay: (m: RelayMessage) => void | Promise<void>;
  /** Server-adjusted clock, ms. */
  nowMs?: () => number;
  /** Reports non-fatal events by kind only; never message contents. */
  onEvent?: (e: { kind: "connected" | "closed" | "unknown-oneof" | "error"; detail?: string | number }) => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  maxAttempts?: number;
}

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

export class InboundStream {
  private readonly dedup = new RelayDedup();
  private lastSeen?: bigint;

  constructor(private readonly d: StreamDeps) {}

  /** Start timestamp per [B@735540]: last seen − 1, else (server time − 60 s) × 1000. */
  startMicros(): bigint {
    return this.lastSeen !== undefined ? this.lastSeen - 1n : defaultStreamStartMicros((this.d.nowMs ?? Date.now)());
  }

  /** Runs until `signal` aborts or a non-retryable error occurs (which is rethrown). */
  async run(signal: AbortSignal): Promise<void> {
    let attempt = 0;
    while (!signal.aborted) {
      try {
        const body = encodeReceiveMessagesRequest(this.d.auth(), this.startMicros());
        this.d.onEvent?.({ kind: "connected" });
        for await (const el of this.d.open(body, signal)) {
          attempt = 0;
          if (el.response !== undefined) await this.handle(el.response);
        }
        this.d.onEvent?.({ kind: "closed" });
      } catch (e) {
        if (signal.aborted) return;
        this.d.onEvent?.({ kind: "error", detail: (e as Error)?.name });
        if (!isRetryable(e) || attempt + 1 >= (this.d.maxAttempts ?? 8)) throw e;
        await (this.d.sleep ?? defaultSleep)(backoffMs(attempt++), signal);
      }
    }
  }

  private async handle(response: unknown): Promise<void> {
    const item = decodeReceiveMessagesResponse(response);
    if (item.kind === "unknown") this.d.onEvent?.({ kind: "unknown-oneof", detail: item.oneofCase });
    if (item.kind !== "relay") return; // heartbeat, batch markers: no-ops (A-016)
    const m = item.relay;
    if (!this.dedup.firstSighting(m.id)) return;
    // Last seen = f3 of the most recent relay message that passed dedup (A-017 [B@737226], [B@737471]).
    if (m.timestamp !== undefined) this.lastSeen = m.timestamp;
    await this.d.onRelay(m);
    // Ack ID = relay f1 (INFERRED, SPEC §6.2 / A-008).
    await this.d.ack(encodeAckMessages(this.d.auth(), [m.id]));
  }
}
