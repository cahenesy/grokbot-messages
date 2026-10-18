// Push updates (spec answer A-019 [B@1068983–1073227]): inbound relay messages whose envelope action is 16
// and request ID is the current session ID. Decrypted plaintext = oneof over fields 2–16.

import { decode, getAllMessages, getMessage, getVarint, oneofCase } from "../protocol/protobuf.js";
import { decodeConversation, decodeMessage, type Conversation, type Message } from "./models.js";

export const PUSH_UPDATE_ACTION = 16;

export type PushUpdate =
  | { kind: "conversations"; conversations: Conversation[] }
  | { kind: "messages"; messages: Message[] }
  | { kind: "typing" }
  | { kind: "settings" }
  | { kind: "alert"; type?: number }
  /** f7: the client must answer with action 17 (empty request) [B@1072507]. */
  | { kind: "ack-request" }
  | { kind: "gaia-unpair" }
  | { kind: "qr-migration" }
  | { kind: "other"; oneofCase?: number };

/** User-alert types [B@1071536]: 1 preempted, 2 browser active, 7/8 inactive, 3/4 data connection, 5/6 battery. */
export const ALERT = { PREEMPTED: 1, BROWSER_ACTIVE: 2, INACTIVE_TIMEOUT: 7, INACTIVE_LACK_OF_ACTIVITY: 8 } as const;

export function decodePushUpdate(plaintext: Uint8Array): PushUpdate {
  const f = decode(plaintext);
  const c = oneofCase(f, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  switch (c) {
    case 2:
      return { kind: "conversations", conversations: getAllMessages(getMessage(f, 2)!, 2).map(decodeConversation) };
    case 3:
      return { kind: "messages", messages: getAllMessages(getMessage(f, 3)!, 2).map(decodeMessage) };
    case 4:
      return { kind: "typing" };
    case 5:
      return { kind: "settings" };
    case 6: {
      const t = getVarint(getMessage(f, 6)!, 2);
      return { kind: "alert", type: t === undefined ? undefined : Number(t) };
    }
    case 7:
      return { kind: "ack-request" };
    case 14:
      return { kind: "gaia-unpair" };
    case 15:
      return { kind: "qr-migration" }; // f1 may carry an account email: not decoded, never logged
    default:
      return { kind: "other", oneofCase: c };
  }
}

/**
 * Stale-update filter (A-019 [B@1073227]): drop an update for an ID whose envelope timestamp is older than
 * the last applied one, per key `conv_<id>` / `msg_<id>`, in a 1000-entry cache.
 */
export class StaleUpdateFilter {
  private last = new Map<string, bigint>();
  constructor(private readonly capacity = 1000) {}
  accept(key: string, ts: bigint | undefined): boolean {
    if (ts === undefined) return true;
    const prev = this.last.get(key);
    if (prev !== undefined && ts < prev) return false;
    this.last.delete(key);
    this.last.set(key, ts);
    if (this.last.size > this.capacity) this.last.delete(this.last.keys().next().value!);
    return true;
  }
}
