# Implementation Plan — Minimal MCP Connector

Suggested phased plan for a clean-room Google Messages for Web connector exposed as an MCP server. Adjust freely; do not treat phase boundaries as protocol facts.

**Legal note (read first):** Google's Terms of Service may restrict automated access to Messages. Publishing a marketplace plugin that talks to Messages on a user's behalf carries **ToS and account-risk**. Obtain your own legal review before any public release. This plan does not constitute legal advice.

---

## Goals (minimal viable connector)

- Pair once via Google-account (emoji) flow or QR phone-relay.
- Persist session material locally (encrypted).
- Refresh auth tokens before expiry.
- List conversations and messages; receive push via `ReceiveMessages`.
- Send plain text only after **explicit per-message user confirmation**.
- Later: reactions and media.

Non-goals for v1: group management, RCS capability probing beyond what pairing needs, multi-account, acting as a bridge for other users.

---

## Language / stack options

| Option | Pros | Cons |
|--------|------|------|
| **TypeScript + official MCP SDK** | Natural fit for Cursor / Grok Bot marketplace plugins; easy JSON-RPC; good HTTP/2 libraries | Crypto and protobuf need careful libraries (`tweetnacl` / Web Crypto / `@noble/*`) |
| **Go + MCP stdio bridge** | Strong concurrency for long-lived streams; solid crypto stdlib | Extra packaging to satisfy marketplace Node expectations; ensure license headers stay MIT/Apache-2.0 |

Recommendation: **TypeScript MCP SDK** unless the team already standardizes on Go. Either way, keep protocol code in a pure library crate/package with no MCP imports so unit tests stay headless.

---

## Module boundaries

```
connector/
  protocol/          # framing, JSPB/protobuf encode-decode per SPEC.md (no I/O)
  crypto/            # key derivation, AES-CTR, HMAC, UKEY2 helpers (no I/O)
  transport/         # HTTPS clients for clients6 / jms-us / upload hosts
  session/           # encrypted local store; RegisterRefresh scheduler
  pairing/           # SignInGaia or RegisterPhoneRelay UX helpers
  actions/           # typed wrappers for actions 2, 3, 9, 22, 38, …
  mcp/               # tools/resources only; calls actions/* after confirmation gates
  testdata/          # spec-defined vectors (no live tokens)
```

Rules: `mcp/` may depend on everything; `protocol/` and `crypto/` must not depend on `mcp/` or `transport/`.

---

## Phase 1 — Pairing + session persistence + token refresh

**Build**

- Device key generation and AuthMessage construction (`SPEC.md` §4).
- Google-account pairing (`SignInGaia` two-step) **or** QR `RegisterPhoneRelay` (pick one first; Gaia recommended).
- Encrypted session store (token, TTL, registration id, keys). Use OS keychain or age/libsodium file encryption.
- `RegisterRefresh` scheduler at ≤90% of TTL.
- Config via `${VAR}` placeholders only.

**Acceptance**

- [ ] Fresh pair completes against the developer's own phone.
- [ ] Process restart reloads session without re-pairing.
- [ ] Forced refresh returns a new token (length logged, value never logged).
- [ ] Repo scan clean of secrets; license MIT or Apache-2.0; `DEVLOG.md` started.

---

## Phase 2 — Read-only

**Build**

- Long-lived `ReceiveMessages` + `AckMessages`.
- Action 9 / list conversations; action 2 / list messages (per `SPEC.md` §7).
- MCP tools: `list_conversations`, `list_messages`, `get_session_status` (no send).

**Acceptance**

- [ ] Lists match what the official web client shows for the same account (spot-check).
- [ ] Incoming self-chat message appears via the stream within a few seconds.
- [ ] Unit tests cover decode of fixtures from `SPEC.md` field layouts.
- [ ] No plaintext from real chats written to CI logs.

---

## Phase 3 — Send text (explicit confirmation)

**Build**

- Action 3 send path with field-5 encryption.
- MCP tool `send_text` that **requires** a confirmation flag / separate confirm tool; default deny.
- Optional companion `jms-us` type-36 handling once `OPEN-QUESTIONS.md` §3 is settled (can no-op initially if phone UI still works).

**Acceptance**

- [ ] Self-chat send delivers to the phone.
- [ ] Tool refuses to send without confirmation.
- [ ] Known-plaintext vector test passes for field 5 (`OPEN-QUESTIONS.md` §2).
- [ ] Live tests documented as self-chat only.

---

## Phase 4 — Reactions and media

**Build**

- Action 38 reactions (add; then remove/change after tests).
- Action 22 typing (optional for MCP).
- Copper + Bugle resumable upload; media send via action 3; download auth per test §8.

**Acceptance**

- [ ] Reaction on delivered self-chat message visible on phone.
- [ ] Small PNG round-trip (upload + send + download) works.
- [ ] Multi-chunk upload test for ≥4 MiB fixture passes or is explicitly deferred with a tracked question.

---

## Test strategy

1. **Unit tests** against spec-defined vectors in `testdata/` (AuthMessage field order, envelope sizes, crypto round-trip with fixed keys). No network.
2. **Live tests** only against the developer's own phone and self-chat. Gate with an env flag such as `${GOOGLE_MESSAGES_LIVE_TEST}=1` (name is local to your repo; do not publish real tokens beside it).
3. **Never** commit HAR files, cookies, or session stores. Keep captures outside the git root or in a gitignored directory.
4. When a live test answers an open question, file it in `QUESTIONS.md` for the spec team.

---

## Grok Bot / Cursor marketplace requirements (already identified)

Before proposing a public plugin listing, satisfy at least:

- **Permissive license only** (MIT or Apache-2.0) — no GPL/AGPL/LGPL dependencies in the shipped tree.
- **Public source repository**.
- **Plugin manifest** + **README** suitable for reviewers.
- **Credential placeholders** as `${VAR}` only — never sample secrets.
- **Privacy policy and Terms of Service** for the plugin.
- **Manual security review** by the marketplace operators.
- Explicit user confirmation for any outbound message side effect.

Failing any of the above blocks publication even if the protocol works.

---

## Google ToS / product risk

- Automated clients may violate Google Messages / Google Account terms.
- Pairing may break without notice when Google changes `mw_b` or relay hosts.
- Recommend: private/self-hosted use first; marketplace submission only after ToS review; document that users pair **their own** account and that the maintainer does not operate a multi-tenant bridge.

---

## Coordination with the spec team

- Ambiguity → `QUESTIONS.md` (written).
- Answers → revised `SPEC.md` / `OPEN-QUESTIONS.md` only.
- Do not request code samples from the spec team; do not send them your implementation for "style review" against excluded projects.
