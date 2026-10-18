# Open Questions (for the implementer's own client)

Updated 2026-10-18 (v0.3: adds §11–§16 from implementer questions Q-001–Q-011; v0.4: adds §17–§19 from Q-012–Q-014; Gaia pairing is the primary path by owner direction). Items already resolved by the spec team's live captures of Google's official web client are summarized in `SPEC.md` (§0.1–§0.4). This file lists **remaining** questions. Each has a concrete test you can run **after your own client pairs** (prefer Google-account / emoji pairing, then self-chat only).

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

## 11. AuthMessage ConfigVersion subfields (Q-001)

**Unknown:** the field numbers of Year/Month/Day/V1/V2 inside AuthMessage f7; whether f7 is required; the Bugle-mode value.

**Test:** In DevTools on the official client, read any `Registration/*` or `Messaging/*` JSPB body. The positions of 2026/10/15/4/6 inside f7 give the field numbers (index *i* = field *i+1*). Then send one call from your client without f7 and record the status.

---

## 12. SendMessage envelope encoding and inbound paths (Q-008)

**Unknown:** whether Message.f12 is a base64 string (INFERRED) or a nested array; qN and deadline for each action; the meaning of f9; the inbound field path to the response envelope, the ack ID, and the preempted flag.

**Test:** Check the JSPB type of f12 in the official client's `SendMessage`. Log qN and deadline for each action number you send. Capture the stream (not via HAR) and match your 36-character request IDs to inbound elements. Log lengths and paths only.

---

## 13. Plaintext action layouts and object schemas (Q-009, Q-010)

**Unknown:** the field numbers for actions 1, 2, 9, 16, 31 and 3 beyond §7, the action-3 status enum, and the Conversation/Message schemas (ID, name, participants, timestamp units, text, sender, direction, status).

**Test:** Once your session keys work (Gaia, §4.2), decrypt the responses to your own self-chat requests. Plant known values (fixture text, known count, known send time, one reaction) and diff. Report field numbers, types and lengths only, with no real message content.

---

## 14. Stream keep-alive, activation, and phone-initiated unpair (Q-011)

**Unknown:** whether anything must be sent periodically (`M4QZzf` 10 s? action 48?); the server's stream lifetime; whether 16 → 31 is mandatory; what arrives when the phone unpairs.

**Test:** Hold one stream for at least 15 minutes and log when the server closes it. Send action 1 once before 16/31 and record the result. Unpair from the phone's Device pairing screen and log the last items (route/type and lengths).

---

## 15. Browser details f5/f6 and non-browser user agent (Q-005)

**Unknown:** what f5/f6 mean and whether they are required; whether the server or phone treats a non-browser UA differently; which strings the phone's device list shows.

**Test:** After pairing works, pair with an honest UA, type 1 and `Linux`, then change one field at a time. Record the status and what the phone's device list shows.

---

## 16. QR (secondary path) wire details (Q-002, Q-003, Q-004)

**Unknown:** the field number of the SPKI inside RegisterPhoneRelay f4 (search for the 91-byte value with prefix `30 59 30 13 …`); the QR-expiry field; which API key is used in QR mode; whether `Origin` is enforced; the route-14 element layout and encryption state.

**Test:** Lower priority (Gaia is primary). Start QR pairing in the official client (no scan needed for RegisterPhoneRelay), walk the binary request/response, and record field paths, lengths and header names only. Remember that the QR is a secret (SPEC §4.1 step 3).

---

## 17. Google web session: header branch, minimal cookie set, token-only calls (Q-012)

**Unknown:** whether relay calls use the timestamped or untimestamped SAPISIDHASH branch; which cookies the server actually checks; whether `Messaging/*` and `RegisterRefresh` work with the GDitto token alone after `SignInGaia`; how long a cookie set stays valid.

**Test:** In DevTools on your own session, look at one `SignInGaia` request and one `Messaging/SendMessage` request. Record only whether `Authorization` is present, which schemes appear, and whether each value has the `<digits>_<40 hex>` shape. Replay a harmless call (action 31), removing cookies one at a time, and record the names that are required. After pairing, send action 1 and `RegisterRefresh` with no cookies and no `Authorization`, and record each status. Never record values.

---

## 18. Camera-free pairing, US QR availability, hosted pairing-page reachability (Q-014)

**Unknown:** whether QR pairing still completes for a US account (Google's help page says it is "no longer available in the US"; the bundle has QR deprecation and migration dialogs, OBSERVED [B@1108270], [B@1107949]); whether the phone's Messages app accepts the QR URL as a tapped link (UNVERIFIED; don't ship it without a live proof, and keep the URL out of logs); whether Google-account pairing can run without the user's Google cookies on the host (credentialed cross-origin calls from a non-Google origin are INFERRED to be refused); whether a hosted connector can expose an HTTPS address for the pairing page.

**Test:** Owner's phone, about two minutes: in Google Messages, is Device pairing → QR code scanner still offered? On `messages.google.com/web` in a private window, is a QR offered, or only the deprecation dialog? If both, scan once, confirm pairing completes, then unpair. Separately, from the connector's own origin, record only the CORS preflight status and response header names for `instantmessaging-pa.clients6.google.com`.

---

## 19. BotGuard token on SignInGaia (Q-013 item 8)

**Unknown:** whether the server requires the BotGuard token at SignInGaia device f39 (SPEC §4.2), and whether the server flag that turns it on is set for ordinary accounts.

**Test:** In your own capture of a SignInGaia mode-0 request, record only whether device f39 is present. If it is, record whether a mode-0 call without f39 succeeds, and its status. If calls without it are refused, report it straight away, because it decides whether Google-account pairing works from a non-browser connector.

---

## 20. Google-account pairing rounds end to end (Q-015)

**Unknown:**
- how `SendMessage` f9 (the registration-ID targets) is encoded in JSPB (a base64 string, or something else);
- whether round-2 f8 (the optional AES-GCM blob) appears for ordinary accounts, and what its fields mean;
- whether the binary-encoded UKEY2 transcript (SPEC §4.2.1) produces the same emoji the phone shows.

**Test:** In your own paired session, record only the JSPB type of `SendMessage` f9 (string or array) and its decoded length. On your first end-to-end attempt, compare the emoji your client computes with the one the phone shows, and record only match or no match. Record only whether round-2 f8 is present and its length. Never record keys, tokens, account emails or registration IDs.

## 21. Stream element kinds and relay-call user agent (A-016, A-003 part 3)

**Unknown:**
- what the `ReceiveMessages` response f1 header holds, the heartbeat (f3) interval, the client idle-timer value, and whether the f4/f5 batch markers or the unread f6/f7 members ever appear;
- whether relay calls (`instantmessaging-pa*`) refuse a non-browser HTTP `User-Agent`, as the public page does.

**Test:** On your own paired session, log only the set oneof case number of each stream element, the relay f2 route, and the time between f3 markers. Never log contents. Make one relay call with the runtime's default UA and, only if it is refused, one with the pinned browser UA. Record only the status codes.

---

## Still useful but lower priority

- QR (`RegisterPhoneRelay`) path field lengths and `c=` base64 variant (Gaia path is the primary target for the MCP connector).
- `CANCEL_GAIA_PAIRING` wire call.
- Application-level action 17 ack vs relay `AckMessages`.
- Concurrent second browser session / session-preempted behavior.
- Inactivity unpair (~14 d config flag) — do not wait; treat as OBSERVED config only.
