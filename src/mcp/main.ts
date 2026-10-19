#!/usr/bin/env node
// MCP stdio server. Tools: session status, pairing (status/link only), read-only listing. No send tools yet.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SpecGapError } from "../protocol/specGaps.js";
import { expiresAtMs, refreshAtMs } from "../session/schedule.js";
import { SessionStore, optionalEnvValue } from "../session/store.js";
import { PairingPageServer } from "../pairing/pageServer.js";
import { QrPairing } from "../pairing/qrPairing.js";
import { encodeRevokeRelayPairing, pairedFromRelay, type PairedData } from "../protocol/pairing.js";
import { CONFIG_VERSION_2026_10_15 } from "../protocol/auth.js";
import { InboundStream } from "../session/stream.js";
import { callJspb } from "../transport/relay.js";
import { callBinary } from "../transport/relay.js";
import { receiveMessages } from "../transport/receive.js";
import { apiKeyProvider } from "../transport/pageConfig.js";
import { z } from "zod";
import { MessagesClient } from "../session/client.js";
import { messageText } from "../actions/models.js";

const VERSION = "0.0.1";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

function failure(e: unknown) {
  const msg = e instanceof SpecGapError ? `${e.message}. This build cannot complete the step until the spec is revised.` : String((e as Error)?.message ?? e);
  return { ...text(msg), isError: true };
}

/** Optional settings: empty or unexpanded placeholders count as unset. */
const optionalEnv = (name: string): string | undefined => optionalEnvValue(process.env, name);

const server = new McpServer({ name: "grokbot-messages", version: VERSION });

// ${GOOGLE_MESSAGES_API_KEY} overrides; otherwise read page-config A16fYe at runtime (A-003).
const apiKey = apiKeyProvider(
  () => optionalEnv("GOOGLE_MESSAGES_API_KEY"),
  undefined,
  () => optionalEnv("GOOGLE_MESSAGES_PAGE_USER_AGENT"),
);

server.registerTool(
  "get_session_status",
  { description: "Report whether Google Messages is paired and when the auth token expires. Never returns secrets." },
  async () => {
    try {
      const s = await SessionStore.fromEnv().load();
      if (!s?.token || !s.tokenTtlMicros || s.tokenReceivedAtMs === undefined) return text("Not paired.");
      const t = { receivedAtMs: s.tokenReceivedAtMs, ttlMicros: BigInt(s.tokenTtlMicros) };
      return text(
        JSON.stringify({
          paired: Boolean(s.phone),
          tokenExpiresAt: new Date(expiresAtMs(t)).toISOString(),
          refreshDueAt: new Date(refreshAtMs(t)).toISOString(),
        }),
      );
    } catch (e) {
      return failure(e);
    }
  },
);

// Pairing per owner direction on #14 (revised A-012): the QR is shown only on the connector's
// single-use page; tools return the link and a status, never the QR or any key (A-007).
let pairing: QrPairing | undefined;

async function getPairing(): Promise<QrPairing> {
  if (pairing) return pairing;
  const base = optionalEnv("GOOGLE_MESSAGES_PAIRING_BASE_URL");
  const page = new PairingPageServer({
    publicBaseUrl: base,
    bindHost: optionalEnv("GOOGLE_MESSAGES_PAIRING_BIND") ?? "127.0.0.1",
    port: Number(optionalEnv("GOOGLE_MESSAGES_PAIRING_PORT") ?? 0),
  });
  await page.start();
  const store = SessionStore.fromEnv();
  pairing = new QrPairing({
    page,
    userAgent: `grokbot-messages/${VERSION}`,
    registerPhoneRelay: async (body) => callBinary({ apiKey: await apiKey() }, "Pairing", "RegisterPhoneRelay", body),
    waitForPaired: async (token, signal) => {
      // QR mode: stream opened with the RegisterPhoneRelay token; route-14 payload in relay f12 (A-017).
      const key = await apiKey();
      const auth = () => ({ network: "Bugle" as const, token, configVersion: CONFIG_VERSION_2026_10_15 });
      const ac = new AbortController();
      signal.addEventListener("abort", () => ac.abort(), { once: true });
      let found: PairedData | undefined;
      let failure: unknown;
      const stream = new InboundStream({
        auth,
        open: (body, s) => receiveMessages({ apiKey: key, body, signal: s }),
        ack: (body) => callJspb({ apiKey: key }, "Messaging", "AckMessages", body),
        onRelay: (m) => {
          try {
            found = pairedFromRelay(m) ?? found;
          } catch (e) {
            failure = e;
          }
          if (found || failure) ac.abort();
        },
        onEvent: (e) => e.kind === "unknown-oneof" && console.error(`stream: unknown oneof case ${e.detail}`),
      });
      await stream.run(ac.signal).catch((e) => (failure ??= e));
      if (found) return found;
      throw failure ?? new Error(signal.aborted ? "pairing timed out" : "stream closed before pairing");
    },
    revoke: async (p) => {
      await callBinary({ apiKey: await apiKey() }, "Pairing", "RevokeRelayPairing", encodeRevokeRelayPairing(p.browser, p.token.token));
    },
    onDiagnostic: (d) => console.error(`pairing: route 14 seen / f4 present / f4.4 length ${d.f4_4Length ?? "absent"}`),
    save: (s) => store.save(s),
    onError: (e) => console.error(`pairing failed: ${e instanceof SpecGapError ? e.gap : (e as Error)?.name ?? "error"}`),
  });
  return pairing;
}

server.registerTool(
  "start_pairing",
  {
    description:
      "Start pairing with the user's own phone. Returns a short-lived, single-use link to open in a browser (a second screen if pairing from a phone); the page shows a QR code to scan in Google Messages → Device pairing → QR code scanner. Returns only the link and a status.",
  },
  async () => {
    try {
      if ((await SessionStore.fromEnv().load())?.phone) return text(JSON.stringify({ status: "paired" }));
      return text(JSON.stringify(await (await getPairing()).start()));
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "get_pairing_status",
  { description: "Status of the current pairing attempt: waiting, paired, expired, failed, or none." },
  async () => {
    try {
      return text(JSON.stringify({ status: pairing?.status() ?? "none" }));
    } catch (e) {
      return failure(e);
    }
  },
);

// Read-only client over the saved QR session (A-018/A-019). Started lazily on first use.
let client: Promise<MessagesClient> | undefined;

async function startClient(): Promise<MessagesClient> {
  const s = await SessionStore.fromEnv().load();
  if (!s?.phone || !s.token) throw new Error("Not paired. Run start_pairing first.");
  const key = await apiKey();
  const token = new Uint8Array(Buffer.from(s.token, "base64"));
  const c = new MessagesClient({
    mode: { kind: "qr", phone: s.phone }, // QR-mode destination = phone identity as received (INFERRED, Q-008)
    keys: { aesKey: new Uint8Array(Buffer.from(s.aesKey, "base64")), hmacKey: new Uint8Array(Buffer.from(s.hmacKey, "base64")) },
    token: () => token,
    sendMessage: (body) => callJspb({ apiKey: key }, "Messaging", "SendMessage", body),
    ack: (body) => callJspb({ apiKey: key }, "Messaging", "AckMessages", body),
    openStream: (body, signal) => receiveMessages({ apiKey: key, body, signal }),
    onEvent: (e) => console.error(`client: ${e.kind}${e.detail === undefined ? "" : ` ${e.detail}`}`), // kinds only, never contents
  });
  await c.start();
  return c;
}

function getClient(): Promise<MessagesClient> {
  client ??= startClient().catch((e) => {
    client = undefined;
    throw e;
  });
  return client;
}

const cursorIn = (c?: string) => (c ? new Uint8Array(Buffer.from(c, "base64url")) : undefined);
const cursorOut = (c?: Uint8Array) => (c ? Buffer.from(c).toString("base64url") : undefined);

server.registerTool(
  "list_conversations",
  {
    description: "List recent Google Messages conversations (25 per page, newest first). Pass `cursor` from a previous result for the next page. Read-only.",
    inputSchema: { cursor: z.string().optional() },
  },
  async ({ cursor }) => {
    try {
      const r = await (await getClient()).listConversations(cursorIn(cursor));
      return text(
        JSON.stringify({
          conversations: r.conversations.map((c) => ({
            id: c.id,
            name: c.name,
            lastActivity: c.lastActivityMs === undefined ? undefined : new Date(c.lastActivityMs).toISOString(),
            unread: c.unread ? c.unread > 0 : undefined,
            isGroup: c.isGroup,
            participants: c.participants.filter((p) => !p.isSelf).map((p) => p.displayName ?? p.fullName ?? p.id),
            preview: c.preview?.text,
          })),
          cursor: cursorOut(r.cursor),
        }),
      );
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "list_messages",
  {
    description: "List messages in one conversation (50 per page). Pass `cursor` from a previous result for older messages. Read-only.",
    inputSchema: { conversation_id: z.string().min(1), cursor: z.string().optional() },
  },
  async ({ conversation_id, cursor }) => {
    try {
      const r = await (await getClient()).listMessages(conversation_id, cursorIn(cursor));
      if (!r.messages.length && !cursor) return { ...text("Conversation not found."), isError: true };
      return text(
        JSON.stringify({
          messages: r.messages.map((m) => ({
            id: m.id,
            time: m.timestampMs === undefined ? undefined : new Date(m.timestampMs).toISOString(),
            outgoing: m.outgoing,
            sender: m.senderId,
            text: messageText(m),
            media: m.parts.filter((p) => p.kind === "media").length || undefined,
            statusCode: m.statusCode, // raw until names are confirmed live (A-019)
            special: m.special || undefined,
          })),
          cursor: cursorOut(r.cursor),
        }),
      );
    } catch (e) {
      return failure(e);
    }
  },
);

await server.connect(new StdioServerTransport());
