# Privacy Policy — grokbot-messages

_Draft, 2026-10-18. Not legal advice; review before any public marketplace listing._

grokbot-messages is open-source software that connects an MCP host (such as Grok Bot) to **your own** Google Messages account through Google Messages for Web.

## What the connector handles

- **Pairing:** Google-account pairing (you confirm a matching emoji on your phone) is the primary method. It requires Google web-session cookies that **you supply**. Those cookies grant broad access to your whole Google account, not just Messages. They are stored only encrypted, never logged or returned to the host, and discarded after pairing where the protocol allows. Signing out of the browser session they came from invalidates them.
- **Pairing and session material:** a device signing key, payload encryption keys, and auth tokens. These are stored only in an encrypted session file at `${GOOGLE_MESSAGES_SESSION_PATH}`, encrypted with a key derived from `${GOOGLE_MESSAGES_SESSION_KEY}`.
- **Message content:** conversations, messages, and contact names that you ask the connector to read, and messages you explicitly confirm for sending. This content flows between Google's servers, the connector process, and the MCP host you use.

## What the maintainers receive

Nothing. The project operates no servers, collects no telemetry, and has no access to your session file or messages.

## Third parties

- **Google** processes your messages under Google's own terms and privacy policy.
- **Your MCP host** (e.g. Grok Bot) receives whatever tool results the connector returns to it, such as message content you ask for. The connector **never** returns tokens, keys, pairing keys or QR codes in tool output. During Google-account pairing, the host sees only the emoji you are asked to match on your phone. The host's handling of tool results is governed by its own privacy policy.

## Hosted connectors (e.g. Grok Bot's cloud computer)

When the host runs the connector on cloud infrastructure dedicated to you, the encrypted session file (mode 0600) lives on that machine. Its passphrase comes from the host's secret/variable mechanism and is never written next to the file. **Limitation:** because the passphrase lives on the same host, the encryption protects against copies of the file leaking, but not against compromise of the host itself.

## Your controls

- Unpair at any time from your phone: Google Messages → Device pairing.
- Delete the session file to remove all stored session material.
- No message is ever sent without your explicit per-message confirmation.
