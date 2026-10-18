# grokbot-messages

A clean-room [MCP](https://modelcontextprotocol.io) connector for **Google Messages for Web**, intended for use as a Grok Bot plugin. Licensed **Apache-2.0**.

> **Status: Phase 1 in progress — not usable yet.** Pairing is blocked on open spec questions (see [Spec gaps](#spec-gaps)). No send/read tools exist yet.

> **Google ToS / account risk.** Automated access to Google Messages may conflict with Google's terms. Use only with your own account and phone. This project does not operate any shared or multi-tenant bridge.

## Clean-room process

This code is written only from the spec team's handoff package in [`docs/handoff/`](docs/handoff/), Google's public web client, and Google's Apache-2.0 UKEY2 library. The handoff [`README`](docs/handoff/README.md) lists the clean-room rules, including the copyleft implementations and write-ups that must not be consulted. Every source used is logged in [`DEVLOG.md`](DEVLOG.md).

Questions for the spec team are filed as GitHub issues with the `spec-question` label. Answers come back as revisions to `docs/handoff/SPEC.md` / `OPEN-QUESTIONS.md`, never as code.

## Design choices

- **Pairing via a single-use page** (owner direction, #14). `start_pairing` returns a short-lived, single-use link. You open it in your own browser and scan the QR code shown there with Google Messages → Device pairing → QR code scanner. The QR (which contains the long-lived payload keys) never appears in tool output, chat, or logs. The tools only return the link and a status. **Pairing from a phone alone:** open the link on any second screen (laptop, tablet, TV browser) and scan it with the phone. A camera-free option is under investigation (#16). Google may be retiring QR pairing in some regions; see #16.
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
| `${GOOGLE_MESSAGES_API_KEY}` | **Optional** override. Normally read automatically from the public Messages web page |
| `${GOOGLE_MESSAGES_PAGE_USER_AGENT}` | **Optional.** That page only serves its config to a current desktop browser User-Agent. The connector sends a pinned one for this single public fetch (not for any relay call). Override it here if it goes stale |
| `${GOOGLE_MESSAGES_PAIRING_BASE_URL}` | **Optional.** HTTPS URL at which your browser reaches the pairing page (default: a local `http://127.0.0.1` address, for running the connector on your own machine) |

Self-hosting extras: `GOOGLE_MESSAGES_PAIRING_BIND` / `GOOGLE_MESSAGES_PAIRING_PORT` set the pairing page's listen address and port.

### Advanced (self-hosted only): Google-account cookies

Not part of the normal setup. Google-account (emoji) pairing would need your Google web-session cookies. ⚠️ **Those cookies grant broad access to your whole Google account, not just Messages.** If this option is ever enabled, the cookies are kept only in memory and in the encrypted session file, never logged or returned, and signing out of the browser session they came from invalidates them. The protocol support is in `src/session/googleAuth.ts`. It is not wired into any tool yet (#15).

Never commit real values. The session file is encrypted with AES-256-GCM using a scrypt-derived key.

## Tools (Phase 1)

- `get_session_status` — whether paired and when the token expires; never returns secrets.
- `start_pairing` — returns `{status, link, expiresAt}` for the single-use pairing page.
- `get_pairing_status` — `waiting`, `paired`, `expired`, `failed` or `none`.

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
