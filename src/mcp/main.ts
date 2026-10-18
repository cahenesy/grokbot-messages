#!/usr/bin/env node
// MCP stdio server. Phase 1 tools: session status and pairing (status/link only). No send tools yet.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SpecGapError } from "../protocol/specGaps.js";
import { expiresAtMs, refreshAtMs } from "../session/schedule.js";
import { SessionStore, requireEnv } from "../session/store.js";
import { PairingPageServer } from "../pairing/pageServer.js";
import { QrPairing } from "../pairing/qrPairing.js";
import { pairedFromStreamElement } from "../protocol/pairing.js";
import { callBinary } from "../transport/relay.js";
import { receiveMessages } from "../transport/receive.js";
import { apiKeyProvider } from "../transport/pageConfig.js";

const VERSION = "0.0.1";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

function failure(e: unknown) {
  const msg = e instanceof SpecGapError ? `${e.message}. This build cannot complete the step until the spec is revised.` : String((e as Error)?.message ?? e);
  return { ...text(msg), isError: true };
}

/** Unset is allowed (transport reports spec gap Q-003); a literal placeholder is not. */
function optionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() ? requireEnv(process.env, name) : undefined;
}

const server = new McpServer({ name: "grokbot-messages", version: VERSION });

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
  // ${GOOGLE_MESSAGES_API_KEY} overrides; otherwise read page-config A16fYe at runtime (A-003).
  const apiKey = apiKeyProvider(
    () => optionalEnv("GOOGLE_MESSAGES_API_KEY"),
    undefined,
    () => optionalEnv("GOOGLE_MESSAGES_PAGE_USER_AGENT"),
  );
  pairing = new QrPairing({
    page,
    userAgent: `grokbot-messages/${VERSION}`,
    registerPhoneRelay: async (body) => callBinary({ apiKey: await apiKey() }, "Pairing", "RegisterPhoneRelay", body),
    waitForPaired: async (_token, signal) => {
      // ReceiveMessages request body and the route-14 path are Q-004; these throw SpecGapError until specified.
      for await (const el of receiveMessages({ apiKey: await apiKey(), signal })) {
        const p = el.response === undefined ? undefined : pairedFromStreamElement(el.response);
        if (p) return p;
      }
      throw new Error("stream closed before pairing");
    },
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

await server.connect(new StdioServerTransport());
