# grokbot-messages

A clean-room [MCP](https://modelcontextprotocol.io) connector for **Google Messages for Web**, intended for use as a Grok Bot plugin. Licensed **Apache-2.0**.

> **Status: Phase 1 in progress — not usable yet.** Pairing is blocked on open spec questions (see [Spec gaps](#spec-gaps)). No send/read tools exist yet.

> **Google ToS / account risk.** Automated access to Google Messages may conflict with Google's terms. Use only with your own account and phone. This project does not operate any shared or multi-tenant bridge.

## Clean-room process

This code is written only from the spec team's handoff package in [`docs/handoff/`](docs/handoff/), Google's public web client, and Google's Apache-2.0 UKEY2 library. The handoff [`README`](docs/handoff/README.md) lists the clean-room rules, including the copyleft implementations and write-ups that must not be consulted. Every source used is logged in [`DEVLOG.md`](DEVLOG.md).

Questions for the spec team are filed as GitHub issues with the `spec-question` label. Answers come back as revisions to `docs/handoff/SPEC.md` / `OPEN-QUESTIONS.md`, never as code.

## Design choices

- **Google-account (emoji) pairing is the primary path** (owner ruling, issue #7). QR pairing is secondary and is not exposed as a tool: its payload contains the long-lived payload keys, so it must never pass through tool output or logs.
- **Hosted use.** On a per-user cloud host such as Grok Bot's, the encrypted session file and its passphrase live on the same machine. That protects against copies of the file, not against compromise of the host.
- **Fail on unknowns.** Wherever the spec does not pin a wire detail, the code throws a `SpecGapError` naming the open question instead of guessing (`src/protocol/specGaps.ts`).

## Layout

```
src/protocol/   protobuf binary + JSPB codecs, AuthMessage, pairing, RegisterRefresh (no I/O)
src/crypto/     payload AES-CTR+HMAC / AES-GCM, ECDSA P-256 device key (no I/O)
src/transport/  HTTPS calls to the Tachyon relay
src/session/    encrypted session store, refresh timing
src/mcp/        MCP stdio server (tools)
test/           unit tests against spec-defined layouts (no network)
```

## Configuration

| Variable | Purpose |
|---|---|
| `${GOOGLE_MESSAGES_SESSION_PATH}` | Path to the encrypted session file |
| `${GOOGLE_MESSAGES_SESSION_KEY}` | Passphrase (≥16 chars) used to encrypt the session file |
| `${GOOGLE_MESSAGES_API_KEY}` | Relay API key; to be replaced by a runtime read of the page config (#3) |
| `${GOOGLE_MESSAGES_GOOGLE_COOKIES}` | **Optional.** Google web-session cookies, needed only for Google-account pairing |

> ⚠️ **Google cookies grant broad access to your whole Google account, not just Messages.** Supply them only if you accept that. They are kept only in memory and in the encrypted session file, never logged or returned in tool output, and dropped after pairing where the protocol allows. Signing out of the browser session they came from invalidates them. If you don't want to share cookies, run the connector yourself (same package, locally or on your own server).

Never commit real values. The session file is encrypted with AES-256-GCM using a scrypt-derived key.

## Tools (Phase 1)

- `get_session_status` — whether paired and when the token expires; never returns secrets.

Sending messages will require explicit per-message user confirmation: a send is first prepared, which returns a one-time code bound to the exact text, and only a matching confirm call executes it (`src/mcp/confirm.ts`).

## Installing as a plugin

The repo is a Cursor-format plugin (`.cursor-plugin/plugin.json` + `mcp.json`), which Grok Bot's marketplace uses. The MCP server runs via `npx -y github:cahenesy/grokbot-messages`; set the plugin variables in the host's plugin configuration.

## Development

```
npm install
npm test
npm run build
```

Requires Node.js 22+; CI and development use **Node.js 24**.

## Spec gaps

Open questions that currently block functionality: see issues labelled [`spec-question`](../../issues?q=label%3Aspec-question).
