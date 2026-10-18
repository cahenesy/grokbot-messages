# Privacy Policy — grokbot-messages

_Draft, 2026-10-18. Not legal advice; review before any public marketplace listing._

grokbot-messages is open-source software that connects an MCP host (such as Grok Bot) to **your own** Google Messages account through Google Messages for Web.

## What the connector handles

- **Pairing and session material:** a device signing key, payload encryption keys, and auth tokens. These are stored only in an encrypted session file at `${GOOGLE_MESSAGES_SESSION_PATH}`, encrypted with a key derived from `${GOOGLE_MESSAGES_SESSION_KEY}`.
- **Message content:** conversations, messages, and contact names that you ask the connector to read, and messages you explicitly confirm for sending. This content flows between Google's servers, the connector process, and the MCP host you use.

## What the maintainers receive

Nothing. The project operates no servers, collects no telemetry, and has no access to your session file or messages.

## Third parties

- **Google** processes your messages under Google's own terms and privacy policy.
- **Your MCP host** (e.g. Grok Bot) receives whatever tool results the connector returns to it, including message content and, during pairing, the pairing QR code. Its handling is governed by that host's privacy policy. When the host runs the connector on its cloud infrastructure, the encrypted session file lives there too.

## Your controls

- Unpair at any time from your phone: Google Messages → Device pairing.
- Delete the session file to remove all stored session material.
- No message is ever sent without your explicit per-message confirmation.
