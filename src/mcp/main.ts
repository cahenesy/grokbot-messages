#!/usr/bin/env node
// MCP stdio server. Phase 1 tools: session status. No send tools yet.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SpecGapError } from "../protocol/specGaps.js";
import { expiresAtMs, refreshAtMs } from "../session/schedule.js";
import { SessionStore, requireEnv } from "../session/store.js";

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

// QR pairing tools were removed per owner ruling A-007 (issue #7): the QR payload carries the
// long-lived AES/HMAC payload keys (SPEC §4.1 step 3) and must never appear in tool output.
// Google-account pairing (SPEC §4.2) is the primary path.

await server.connect(new StdioServerTransport());
