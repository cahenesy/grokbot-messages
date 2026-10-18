# Google Messages for Web — Clean-Room Handoff Package

**Audience:** the implementation team building a new, permissively licensed MCP connector for Google Messages for Web.

**Purpose:** give you a protocol specification and an implementation plan that are safe to work from. Everything here was produced by a separate **spec team** under clean-room rules. Supporting artifacts (bundle copies, capture summaries, provenance records and related notes) are **held by the spec team** and are not in this package.

Package contents:

| File | Role |
|------|------|
| `README.md` | This file — purpose and clean-room rules |
| `SPEC.md` | Behavioral protocol specification |
| `OPEN-QUESTIONS.md` | Remaining questions with concrete tests you can run |
| `IMPLEMENTATION-PLAN.md` | Suggested phased plan for a minimal MCP connector |
| `QUESTIONS.md` | Written Q&A log between implementer and spec team |

---

## CLEAN-ROOM RULES (mandatory)

1. **Never view** any of the following, their source trees, forks, mirrors, or write-ups derived from them:
   - `mautrix/gmessages` (and its `libgm` package)
   - Any other GPL, AGPL, or LGPL Google Messages / Bugle / Tachyon client or bridge
   - Derived write-ups and wrappers — **do not open**:
     - **ZeroAI research note** — `https://github.com/Natfii/ZeroAI/blob/main/docs/research/google-messages-bugle-protocol.md`
     - **OpenMessage** (Max Ghenis) — `https://maxghenis.com/blog/openmessage/`
     - **gmkit** — `https://github.com/johnlindquist/gmkit`
     - **EionRobb gist** — gist id `06093d853abf2bf1527937af554316ca` (search title: "Hand coded protobuf based on reverse engineering the web interface of google messages")

2. **Work only from** this handoff package plus Google's public client and documentation:
   - `https://messages.google.com/web/` and its JavaScript under `https://www.gstatic.com/_/messagesweb/`
   - Google's published "Messages End-to-End Encryption Overview" PDF
   - Google's Apache-2.0 UKEY2 library (protocol facts only)
   - Your own live traffic against the official web client and/or your own paired phone

3. **Questions go to the spec team in writing.** Append them to `QUESTIONS.md`. Answers come back as **spec revisions** (updates to `SPEC.md` / `OPEN-QUESTIONS.md`), never as code, patches, or "here's how libX does it."

4. **License:** the connector must be **MIT or Apache-2.0** only. Do not copy code, protos, or comments from copyleft projects.

5. **Dev log of sources consulted.** Keep a dated log (e.g. `DEVLOG.md` in your repo) naming every URL, document, and capture you used while implementing. Do not log secrets.

6. **Security / secrets:**
   - No secrets in the repository (tokens, cookies, device keys, phone numbers of real contacts, account emails).
   - Session keys and tokens stay encrypted at rest, locally on the developer's machine (or the end-user's machine).
   - In marketplace plugin manifests and sample config, use `${VAR}` placeholders only (e.g. `${GOOGLE_MESSAGES_SESSION_PATH}`), never literal credentials — per Grok Bot / Cursor marketplace plugin rules.
   - Live tests only against the developer's own phone and self-chat. Never automate messaging to third parties without explicit per-message user confirmation.

7. If you accidentally open a do-not-open source, stop, record the incident in `QUESTIONS.md`, and wait for the spec team before continuing.

---

## How to use this package

1. Read `SPEC.md` end to end.
2. Skim `OPEN-QUESTIONS.md` so you know what is still unknown.
3. Follow `IMPLEMENTATION-PLAN.md` phases; do not skip ahead to send/react until pairing + read-only work.
4. When the spec is ambiguous, write a question in `QUESTIONS.md` rather than guessing from excluded sources.

Version: handoff 2026-10-18 (America/New_York).
