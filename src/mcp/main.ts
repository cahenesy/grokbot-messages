#!/usr/bin/env node
// MCP stdio server. Phase 1 tools: session status and QR pairing. No send tools yet.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import QRCode from "qrcode";
import { DeviceKey } from "../crypto/deviceKey.js";
import { generatePayloadKeys } from "../crypto/payload.js";
import { BROWSER_TYPE_OTHER, decodeRegisterPhoneRelayResponse, encodeRegisterPhoneRelay, qrUrl } from "../protocol/pairing.js";
import { SpecGapError } from "../protocol/specGaps.js";
import { expiresAtMs, refreshAtMs } from "../session/schedule.js";
import { SessionStore } from "../session/store.js";
import { callBinary } from "../transport/relay.js";

const VERSION = "0.0.1";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

function failure(e: unknown) {
  const msg = e instanceof SpecGapError ? `${e.message}. This build cannot complete the step until the spec is revised.` : String((e as Error)?.message ?? e);
  return { ...text(msg), isError: true };
}

const server = new McpServer({ name: "grokbot-messages", version: VERSION });

server.registerTool(
  "get_session_status",
  { description: "Report whether Google Messages is paired and when the auth token expires. Never returns secrets." },
  async () => {
    try {
      const s = await SessionStore.fromEnv().load();
      if (!s?.token || !s.tokenTtlMicros || s.tokenReceivedAtMs === undefined) return text("Not paired. Run start_pairing.");
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

server.registerTool(
  "start_pairing",
  {
    description:
      "Start QR pairing with the user's own phone. Returns a QR code to scan in Google Messages → Device pairing → QR code scanner.",
  },
  async () => {
    try {
      const store = SessionStore.fromEnv();
      if ((await store.load())?.phone) return text("Already paired. Unpair before pairing again.");
      // The QR image embeds the payload keys and passes through the conversation; see issue #7.
      const key = DeviceKey.generate();
      const payload = generatePayloadKeys();
      const req = encodeRegisterPhoneRelay({
        browser: { userAgent: `grokbot-messages/${VERSION}`, browserType: BROWSER_TYPE_OTHER, os: "Linux" },
        spkiDer: key.spki(),
      });
      const res = decodeRegisterPhoneRelayResponse(
        await callBinary({ apiKey: process.env.GOOGLE_MESSAGES_API_KEY }, "Pairing", "RegisterPhoneRelay", req),
      );
      await store.save({
        version: 1,
        deviceKeyPkcs8: Buffer.from(key.pkcs8()).toString("base64"),
        aesKey: Buffer.from(payload.aesKey).toString("base64"),
        hmacKey: Buffer.from(payload.hmacKey).toString("base64"),
        token: Buffer.from(res.token.token).toString("base64"),
        tokenTtlMicros: res.token.ttlMicros.toString(),
        tokenReceivedAtMs: Date.now(),
      });
      const url = qrUrl(res.pairingKey, payload.aesKey, payload.hmacKey);
      const png = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, scale: 6 });
      return {
        content: [
          { type: "text" as const, text: "Scan this QR code with Google Messages on your phone: Device pairing → QR code scanner." },
          { type: "image" as const, data: png.replace(/^data:image\/png;base64,/, ""), mimeType: "image/png" },
        ],
      };
    } catch (e) {
      return failure(e);
    }
  },
);

await server.connect(new StdioServerTransport());
