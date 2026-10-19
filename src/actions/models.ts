// Conversation / Participant / Message layouts (spec answer A-019 on #10). Binary protobuf inside the
// decrypted payload. Names, addresses and text are personal data: never log them.

import { decode, getAllMessages, getMessage, getString, getVarint, oneofCase, type RawField } from "../protocol/protobuf.js";

const num = (v: bigint | undefined) => (v === undefined ? undefined : Number(v));
const bool = (f: RawField[], n: number) => getVarint(f, n) === 1n;

export interface Participant {
  /** Identity f2: used as participant ID and displayed destination (INFERRED address) [B@365516]. */
  id?: string;
  firstName?: string;
  fullName?: string;
  displayName?: string;
  isSelf: boolean;
}

export function decodeParticipant(f: RawField[]): Participant {
  const ident = getMessage(f, 1);
  const profile = getMessage(f, 21);
  return {
    id: ident && getString(ident, 2),
    firstName: getString(f, 2) ?? (profile && getString(profile, 2)),
    fullName: getString(f, 3),
    displayName: getString(f, 15) ?? (profile && getString(profile, 1)),
    isSelf: bool(f, 6),
  };
}

export interface Conversation {
  id: string;
  name?: string;
  /** f5 µs → ms. */
  lastActivityMs?: number;
  /** f6 > 0 (INFERRED unread count). */
  unread?: number;
  isGroup: boolean;
  /** f12 status, same value set as the action-1 filter. */
  status?: number;
  participants: Participant[];
  preview?: { text?: string; outgoing: boolean; statusCode?: number };
}

export function decodeConversation(f: RawField[]): Conversation {
  const id = getString(f, 1);
  if (id === undefined) throw new Error("conversation missing id");
  const pv = getMessage(f, 4);
  const ts = getVarint(f, 5);
  const pvStatus = pv && getMessage(pv, 5);
  return {
    id,
    name: getString(f, 2),
    lastActivityMs: ts === undefined ? undefined : Number(ts / 1000n),
    unread: num(getVarint(f, 6)),
    isGroup: bool(f, 10),
    status: num(getVarint(f, 12)),
    participants: getAllMessages(f, 20).map(decodeParticipant),
    preview: pv && { text: getString(pv, 1), outgoing: bool(pv, 2), statusCode: pvStatus && num(getVarint(pvStatus, 2)) },
  };
}

export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "media"; contentType?: number }
  | { kind: "location"; text?: string }
  | { kind: "rich-card" }
  | { kind: "other"; oneofCase?: number };

/** Part oneof over 2–6 [B@372180]: 2 text {f1}, 3 media {f1 content-type}, 5 location {f2 text}, 6 rich card. */
export function decodePart(f: RawField[]): MessagePart {
  switch (oneofCase(f, [2, 3, 4, 5, 6])) {
    case 2:
      return { kind: "text", text: getString(getMessage(f, 2)!, 1) ?? "" };
    case 3:
      return { kind: "media", contentType: num(getVarint(getMessage(f, 3)!, 1)) };
    case 5: {
      const loc = getMessage(getMessage(f, 5)!, 2);
      return { kind: "location", text: loc && getString(loc, 1) };
    }
    case 6:
      return { kind: "rich-card" };
    default:
      return { kind: "other", oneofCase: oneofCase(f, [4]) };
  }
}

/** True when the part has a content case (2–6) set (A-019/A-020 placeholder rule). */
export const partHasContent = (p: MessagePart): boolean => p.kind !== "other" || p.oneofCase === 4;

/**
 * Render rule [B@1052849]: status 300, or type 3 with status ≠ 105, or every part has a content case.
 * Otherwise the update is a placeholder and is skipped until a later one.
 */
export const isRenderable = (m: Message): boolean =>
  m.statusCode === 300 || (m.type === 3 && m.statusCode !== 105) || m.parts.every(partHasContent);

export interface Message {
  id: string;
  conversationId?: string;
  /** f5 µs → ms. */
  timestampMs?: number;
  /** f4.f2 raw status code (exposed raw until names are confirmed live, A-019). */
  statusCode?: number;
  /** Status 1–99 ⇒ outgoing; ≥ 100 incoming [B@1027337]. */
  outgoing: boolean;
  /** f9 INFERRED sender participant ID. */
  senderId?: string;
  type?: number;
  parts: MessagePart[];
  /** f16 true or status 200–211 / 217 → system/tombstone (INFERRED), no parts rendered. */
  special: boolean;
}

export function decodeMessage(f: RawField[]): Message {
  const id = getString(f, 1);
  if (id === undefined) throw new Error("message missing id");
  const st = getMessage(f, 4);
  const code = st && num(getVarint(st, 2));
  const ts = getVarint(f, 5);
  const special = bool(f, 16) || (code !== undefined && ((code >= 200 && code <= 211) || code === 217));
  return {
    id,
    conversationId: getString(f, 7),
    timestampMs: ts === undefined ? undefined : Number(ts / 1000n),
    statusCode: code,
    outgoing: code !== undefined && code >= 1 && code <= 99,
    senderId: getString(f, 9),
    type: num(getVarint(f, 11)),
    parts: special ? [] : getAllMessages(f, 10).map(decodePart),
    special,
  };
}

/** Text of a message: f2.f1 of each text part, in order (A-019). */
export const messageText = (m: Message): string =>
  m.parts.flatMap((p) => (p.kind === "text" ? [p.text] : p.kind === "location" && p.text ? [p.text] : [])).join("\n");

export { decode };
