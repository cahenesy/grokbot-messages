# Open Questions (for the implementer's own client)

Updated 2026-10-18. Items already resolved by the spec team's live captures of Google's official web client are summarized in `SPEC.md` (§0.1–§0.4). This file lists **remaining** questions. Each has a concrete test you can run **after your own client pairs** (prefer Google-account / emoji pairing, then self-chat only).

Do not use third-party traffic, other people's numbers, or excluded implementations to answer these. When a test settles a question, notify the spec team via `QUESTIONS.md` so they can revise `SPEC.md`.

---

## 1. ReceiveMessages stream event types

**Unknown:** which route/type numbers appear on a long-lived `ReceiveMessages` stream (pairing event 14 is documented; heartbeats, incoming messages, revoke, and other routes are not fully mapped from retained browser exports).

**Test:** After pairing, keep `ReceiveMessages` open for ≥15 minutes. Log only the outer route/type field and payload byte lengths (not plaintext). Trigger: an incoming self-chat text from the phone, a typing indicator from the phone, and (if safe) an unpair from the phone Settings UI. Record which type numbers appear and their order relative to `AckMessages`.

---

## 2. Field-5 crypto known-plaintext

**Unknown:** confirm that Bugle action envelope field 5 is flat `ciphertext || IV(16) || HMAC-SHA256(32)` under AES-256-CTR, with HMAC over `ciphertext||IV` (preferred hypothesis in `SPEC.md` §5). Nested encrypted-container protobuf is contradicted by live sizes but not fully disproven without decrypt.

**Test:** In your client, encrypt a **fixture** plaintext you chose (fixed conversation id, fixed temp message id, fixed short body such as `test-vector-001`). Capture the field-5 bytes your client would send (or that the official client sends for the same known body if you inject via DevTools only on your account). Verify decrypt + HMAC with the keys derived per `SPEC.md` §5. Do **not** log plaintext from real chats.

---

## 3. jms-us message type 36

**Unknown:** after Bugle action 3 (send) and action 38 (reaction), the official client also posts a `jms-us` `SendMessage` with message type **36**. Purpose and effect on UI (e.g. double-bubble) are unclear.

**Test:** Send one self-chat RCS text; then one reaction. For each, record whether a type-36 call follows, its AuthMessage network string, and opaque payload length. Disable or delay the type-36 call in a private experiment (your client only) and observe whether the phone UI still shows a single delivered bubble.

---

## 4. Reaction remove / change

**Unknown:** action 38 variants for removing a reaction or changing emoji. Pending-message react appears UI-blocked on the official client.

**Test:** On a **delivered** self-chat message: add thumbs-up (baseline), change to another emoji, then remove. Capture action number, enum/field differences inside the encrypted blob size, and whether a second action 38 or a different action is used. Confirm pending (unsent/failed) messages still cannot be reacted to.

---

## 5. SMS fallback

**Unknown:** wire shape when the destination is not RCS-reachable (SMS/MMS fallback).

**Test:** Against a destination that `LookupRegistered` reports as not RCS (use a test number you control, or a land-line stub you own — never a stranger). Start conversation + send a short text. Record whether action 3 still applies, network string changes (`RCS` vs other), and whether Copper upload paths appear for media.

---

## 6. Mark-read

**Unknown:** which action marks a conversation or message read (candidates exist in the inferred action catalog; not verified live).

**Test:** Open a self-chat with an unread incoming message on the phone; read it from your client only. Capture the Bugle action number and envelope shape (field sizes only). Confirm the phone UI clears the unread badge.

---

## 7. Typing start / stop (action 22 subtypes)

**Unknown:** action 22 is compose/typing-related (VERIFIED-LIVE) but start vs stop (or cancel) subtypes are not separated.

**Test:** In self-chat, type at least one character (start), wait until the official client would send stop/clear, then clear the compose box. Capture two action-22 envelopes and diff field sizes / leading plaintext enum fields outside field 5. Repeat with your client once encryption works.

---

## 8. Media download authorization

**Unknown:** how the browser authorizes downloading an attachment (URL source, cookie vs bearer vs signed URL).

**Test:** Send yourself an image from the phone. From the web client network panel (or your client), record the download host, whether `Authorization` / cookie / query signature is present (redact token values — log only header **names** and URL path patterns), and whether Bugle or Copper hosts are used.

---

## 9. Multi-chunk uploads

**Unknown:** resumable upload behavior for files larger than one chunk (small PNG single-chunk path is VERIFIED-LIVE).

**Test:** Upload a fixture file ≥4 MiB (random bytes, not personal photos) via the official client and via your client. Record `x-goog-upload-*` command sequence (`start`, `upload`, `finalize`), chunk sizes, and whether Bugle ciphertext size = plaintext + constant overhead per chunk or per object.

---

## 10. Token refresh (RegisterRefresh)

**Unknown:** live timing and request signature encoding (raw vs DER ECDSA) for `Registration/RegisterRefresh`. Gaia tokens showed TTL = 24 h; refresh at 90%/95% of lifetime is OBSERVED in JS but not exercised in short sessions.

**Test:** Either wait until ~90% of TTL with a long-lived session, or temporarily lower your client's refresh threshold to force one refresh. Capture RegisterRefresh request/response field layout (no token values in logs — lengths only) and whether the server returns a new TTL and optional server-time correction field.

---

## Still useful but lower priority

- QR (`RegisterPhoneRelay`) path field lengths and `c=` base64 variant (Gaia path is the primary target for the MCP connector).
- `CANCEL_GAIA_PAIRING` wire call.
- Full UKEY2 submessage mapping inside SignInGaia field 2 beyond type=3.
- Application-level action 17 ack vs relay `AckMessages`.
- Concurrent second browser session / session-preempted behavior.
- Inactivity unpair (~14 d config flag) — do not wait; treat as OBSERVED config only.
