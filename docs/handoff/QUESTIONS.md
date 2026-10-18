# Questions Log (implementer ↔ spec team)

Use this file for **written** questions only. The spec team answers by revising `SPEC.md` / `OPEN-QUESTIONS.md`, not by pasting code.

Rules reminder: no excluded sources; no secrets; no phone numbers or account emails in this log.

---

## Template

### Q-NNN — YYYY-MM-DD — &lt;short title&gt;

- **From:** implementer | spec-team
- **Context:** which section of `SPEC.md` / phase of `IMPLEMENTATION-PLAN.md`
- **Question:**
- **What we already tried:** (tests, not excluded repos)
- **Attachment:** (optional redacted field lengths / hex of non-secret fixtures)

### A-NNN — YYYY-MM-DD

- **Answer summary:**
- **Spec change:** link/section updated in `SPEC.md` or `OPEN-QUESTIONS.md`

---

## Log

Questions are filed as GitHub issues labelled `spec-question`: https://github.com/cahenesy/grokbot-messages/issues?q=label%3Aspec-question — one issue per question, numbered Q-NNN to match `src/protocol/specGaps.ts`.

- 2026-10-18: Q-001 → #1, Q-002 → #2, Q-003 → #3, Q-004 → #4, Q-005 → #5, Q-006 → #6, Q-007 → #7

## Spec-team answers (posted as issue comments on #1–#11, 2026-10-18)

### Q-001 — 2026-10-18 — ConfigVersion subfield numbers in AuthMessage f7 (GitHub #1)

- **From:** implementer
- **Context:** SPEC.md §0.1 item 3, §4.3; IMPLEMENTATION-PLAN Phase 1
- **Question:** What are the field numbers of Year/Month/Day/V1/V2 inside AuthMessage f7? Is f7 required on every JSPB relay call? Is the QR-mode (`Bugle`) value the same as the GDitto one?

### A-001 — 2026-10-18

- **Answer summary:**
  1. **Values: VERIFIED-LIVE.** AuthMessage f7 carried ConfigVersion values 2026 / 10 / 15 / 4 / 6 (Year/Month/Day/V1/V2) on Google-account (GDitto) and RCS calls captured on 2026-10-18.
  2. **Subfield numbers: UNVERIFIED.** The spec team's records give the values and their order, but not the field number of each one. We will not supply a number we haven't confirmed. Keep `SpecGapError("Q-001")` until you confirm it.
  3. **Required on every call: UNVERIFIED.** f7 appeared in the AuthMessage of the captured GDitto/RCS JSPB calls. We have not tested whether the server rejects a call that omits f7.
  4. **Bugle (QR) value: UNVERIFIED.** We have no QR-mode capture. The values look tied to the web client build (`messagesweb.mw.en_US.4-84y6pqYJM.O`) rather than to the network string (INFERRED), so expect the same values but confirm them.
- **How to test with your own client:** Open the official web client in your own browser and open DevTools → Network. Pick any `Registration/*` or `Messaging/*` request (`application/json+protobuf`). In the request body, f1 of the RPC is the AuthMessage, and its f7 is a nested array. In JSPB, array index *i* is field *i+1* (SPEC §3), so the positions of 2026/10/15/4/6 give the field numbers directly. Record the positions and the call names (no tokens). Since the values change with the client build, read them at runtime or from config instead of hard-coding them.
- **Spec change:** SPEC.md §0.1 item 3 / §4.3 to note "subfield numbers UNVERIFIED; implementer to confirm from own JSPB traffic".

### Q-002 — 2026-10-18 — SPKI field number in RegisterPhoneRelay f4; QR expiry field (GitHub #2)

- **From:** implementer
- **Context:** SPEC.md §4.1 step 2
- **Question:** Which field inside the f4 key-data submessage carries the SPKI DER? Is there an extra level of nesting? Which response field carries the QR expiry?

### A-002 — 2026-10-18

- **Answer summary:**
  1. **SPKI field number: UNVERIFIED.** The only established facts are the ones in §4.1 step 2, which were OBSERVED in Google's JS: f4 wraps a submessage with f1 = `2`, and that submessage carries an X.509 SPKI DER P-256 key. Our records don't give the field number for the DER bytes or say whether there is a further level of nesting. We have no live capture of `RegisterPhoneRelay`. Every live capture was Google-account mode, which doesn't call `Pairing/*` (SPEC §0.1 item 2).
  2. **QR expiry field number: UNVERIFIED.** The client converts the expiry with `/1000`, the same way it converts the token TTL, so it is probably microseconds (INFERRED). The field number isn't recorded.
- **How to test with your own client:**
  - Option A: Start QR pairing in the official web client in your own browser. You don't need to scan. Save the `Pairing/RegisterPhoneRelay` request body (binary, `application/x-protobuf`) and run a schema-less protobuf walker on it. A P-256 SPKI DER is exactly 91 bytes and begins `30 59 30 13 06 07 2A 86 48 CE 3D 02 01`. The field path to that 91-byte value answers both the field-number and nesting questions. In the response, look for a varint that comes out as a plausible minutes-scale value after `/1000 → ms`. That varint is the QR expiry. Record field paths and lengths only, never token or pairing-key bytes.
  - Option B: Read Google's public `mw_b` bundle near [B@1086147] (the `vJ` method) and [B@1210378]. That is an allowed source under clean-room rule 2.
- **Note from the spec team:** IMPLEMENTATION-PLAN Phase 1 recommends Google-account (Gaia) pairing because every VERIFIED-LIVE fact we have (SignInGaia two-step, token TTL, AuthMessage layout) comes from that mode. The QR path is listed in OPEN-QUESTIONS as lower priority. Q-001 through Q-005 come from choosing QR first. See A-007 for the hosting trade-off.
- **Spec change:** SPEC.md §4.1 step 2 to note "f4 inner field number and expiry field number UNVERIFIED; no QR capture".

### Q-003 — 2026-10-18 — Which API key and headers for QR-mode relay calls (GitHub #3)

- **From:** implementer
- **Context:** SPEC.md §2, §4.1
- **Question:** For QR mode on `instantmessaging-pa.googleapis.com`, which embedded key is sent as `X-Goog-Api-Key`, identified by location? Are other headers required (`X-Goog-AuthUser`, `Origin`/`Referer`)?

### A-003 — 2026-10-18

- **Answer summary:**
  1. **Which key: UNVERIFIED for QR mode.** OBSERVED: two `AIza…` keys are in the page config and one is in the bundle. They are attached as `X-Goog-Api-Key` at [B@1084238] (the region where the `Pairing` client is built) and [B@973804]. The spec team hasn't recorded which config flag feeds the Pairing/Messaging clients in QR mode. Look at those two offsets in the public bundle (rule 2 allows this) to see which page-config value is wired in.
  2. **Headers known for all relay calls:** `X-User-Agent: grpc-web-javascript/0.1` (OBSERVED, and VERIFIED-LIVE in Gaia mode). `Content-Type: application/x-protobuf` for `Pairing/*` and `application/json+protobuf` for `Messaging/*` / `Registration/*` (OBSERVED, §3). Optionally, `X-Accept-Content-Transfer-Encoding: base64` to get base64-wrapped binary responses (OBSERVED).
  3. **`X-Goog-AuthUser` and `Authorization: SAPISIDHASH …`:** OBSERVED only with Google-account (cookie) mode and `withCredentials`. They aren't expected in QR mode (INFERRED). The bearer token goes in AuthMessage, not in a header (§4.3).
  4. **`Origin`/`Referer`: UNVERIFIED.** A browser sends `Origin: https://messages.google.com` automatically. qutebrowser issue #4426 publicly confirms that CORS headers are involved on `RegisterPhoneRelay`. We have no evidence on whether the server enforces Origin for clients that aren't browsers.
- **How to test with your own client:** Start QR pairing in the official web client and record the request header names on `RegisterPhoneRelay` and the first `ReceiveMessages`. Record names only, with the key value redacted to its config-flag source. Then repeat from your connector with and without `Origin` and record the HTTP and gRPC status.
- **Spec change:** SPEC.md §2 / §3 to add "QR-mode key source UNVERIFIED; headers list above".

### Q-004 — 2026-10-18 — ReceiveMessages route-14 element layout; QR capture request (GitHub #4)

- **From:** implementer
- **Context:** SPEC.md §3 Streaming, §4.1 step 4, §8; OPEN-QUESTIONS §1
- **Question:** (1) Is stream element `"1"` JSPB or base64 binary, and what are the field paths to route/type and the payload? (2) Is the route-14 container binary or JSPB, and is it encrypted? (3) What is the ReceiveMessages request body in QR mode? (4) Can the spec team capture one QR pairing, and do current phone builds still offer Device pairing → QR code scanner?

### A-004 — 2026-10-18

- **Answer summary:**
  1. **Element encoding and field path: UNVERIFIED.** OBSERVED: stream elements are objects with key `"1"` = serialized response and key `"2"` = status/trailer [B@948653], and the incoming message's route/type is "field 2", where 14 = pairing [B@1210378]. The `Messaging` client is built with `format:"jspb"` (OBSERVED, §3), so element `"1"` is *probably* a JSPB array (INFERRED, not confirmed). We haven't recorded the full path from the stream element to field 2 and to the payload bytes. The browser HAR exports didn't keep any streaming bodies (§0.1 item 10).
  2. **Container encoding and encryption: UNVERIFIED.** We only know that the decoded payload contains a container whose f4 = paired data {1 phone identity, 2 token {1 token, 2 TTL}, 3 browser identity} (OBSERVED). We can't say whether it is binary or JSPB, or whether it is encrypted at that point. Your decoder should try JSPB first and fall back to binary, and fail clearly otherwise. That is a design suggestion, not a protocol fact.
  3. **QR-mode request body: UNVERIFIED** beyond "opened using the token from step 2" (OBSERVED), meaning an AuthMessage at minimum. No other fields are recorded.
  4. **QR capture by the spec team:** Deprioritized. The project owner has made Google-account (Gaia) pairing the primary path (see #7), so the spec team doesn't plan a QR capture for now. We also haven't confirmed whether current phone builds offer Device pairing → QR code scanner. Our live session used the Google-account option.
- **How to test with your own client:** HAR export drops streaming bodies, so capture `ReceiveMessages` some other way. You can use the DevTools response/EventStream view of the live request, or a local intercepting proxy on your own machine. Log only element sizes, the top-level shape (array or string), and the position of any small integer equal to 14 around the moment the phone scans. Don't log payload bytes or tokens. OPEN-QUESTIONS §1 has the longer stream-mapping test.
- **Spec change:** SPEC.md §3 Streaming / §4.1 step 4 / §8 to mark the element encoding and field paths UNVERIFIED and mark JSPB as INFERRED.

### Q-005 — 2026-10-18 — Meaning of browser-details f5/f6; non-browser user agent (GitHub #5)

- **From:** implementer
- **Context:** SPEC.md §4.1 step 2 (browser details, field 3)
- **Question:** What do f5 (bool) and f6 (enum 1/2/3) mean, and are they required? Is an honest user agent with browser type 1 ("other") acceptable? Does the phone show f1/f2/f3 in its device list? Is there any evidence of rejection?

### A-005 — 2026-10-18

- **Answer summary:**
  1. **f5 / f6 meaning and whether they're required: UNVERIFIED.** OBSERVED only as "f5 = boolean, f6 = device-kind enum with values 1, 2, 3". Our records don't say what they mean, and we haven't tested whether omitting them is accepted.
  2. **Browser-type mapping:** other→1, Chrome→2, Firefox→3, Safari→4, Opera→5, IE-other→6, Edge/IE→7 (the mapping is INFERRED). OS strings are from the set in §4.1.
  3. **Non-browser user agent:** No evidence either way. The spec team never sent non-browser values, so no rejection has been observed. From the spec side, an honest user agent with type 1 is acceptable. Whether Google tolerates it is a product/ToS risk, not a protocol fact.
  4. **Phone device list: UNVERIFIED.** We didn't record which fields the phone shows for a paired device.
- **How to test with your own client:** Once pairing works, pair with f1 = `grokbot-messages/<version>`, f2 = 1, f3 = `Linux`, and f5/f6 omitted. Check the phone's Device pairing list and note which strings appear. Then change one field at a time (f2, f3, set f5/f6 to each value) and record the server status. Use your own phone only.
- **Spec change:** SPEC.md §4.1 step 2 to add "f5/f6 semantics and requiredness UNVERIFIED".

### Q-006 — 2026-10-18 — Clean-room ruling: AI implementer with possible training exposure (GitHub #6)

- **From:** implementer
- **Context:** Handoff README, clean-room rules 1 and 7
- **Question:** Is an AI implementer that can't rule out training-data exposure to do-not-open projects acceptable? If not, what controls are wanted?

### A-006 — 2026-10-18

- **Ruling: APPROVED by the project owner.** The arrangement is acceptable with the controls below, and your existing safeguards (fail on unknowns via `SpecGapError`, and `DEVLOG.md`) stay in place. The owner has approved these controls as binding for this project:
  1. **Traceability:** every protocol constant (field number, enum value, length, host, salt or label string) has a comment or test naming the SPEC.md section, or the GitHub answer it came from. A constant with no citation is a defect.
  2. **No constants from recall:** a value that isn't in SPEC.md or a written answer must not be committed even if it "seems right". It stays a `SpecGapError` until the spec is revised, or until your own capture of the official client confirms it and you log that in DEVLOG.md.
  3. **Spec-team constant review:** before each phase is merged, the spec team checks a constant table against SPEC.md and records the result in QUESTIONS.md.
  4. **Attestation:** add a dated statement to DEVLOG.md saying no do-not-open source was opened, searched for, or retrieved, and renew it each phase.
  5. **Structural originality:** module layout and naming follow IMPLEMENTATION-PLAN.md, not any external project.
- **Spec change:** clean-room rules in `docs/handoff/README.md` to add these controls (follow-up docs change). Until then, this comment is the record.

### Q-007 — 2026-10-18 — Secrets rule vs Grok Bot cloud hosting and QR in chat (GitHub #7)

- **From:** implementer
- **Context:** Handoff README rule 6; IMPLEMENTATION-PLAN Phase 1
- **Question:** (1) Does an encrypted session file on the per-user Grok Bot cloud computer, with its passphrase as a `${VAR}`, satisfy rule 6? (2) Is it acceptable to return the QR code as an image in the bot conversation?

### A-007 — 2026-10-18

- **Answer summary:**
  1. **Hosting: APPROVED by the project owner.** Rule 6 means secrets are encrypted at rest, live only on a machine dedicated to the end user, and never reach the repo, logs, or tool output. The approved reading is that a per-user cloud computer counts as "the end-user's machine" if: it is single-tenant; the session file is mode 0600; the passphrase comes from the host's secret/env mechanism and is never written next to the file; and no tool ever returns token, key, or pairing-key bytes. Keeping the passphrase on the same host only protects against copies of the file, not against compromise of the host. Document that limitation in the README and privacy policy.
  2. **QR in chat: not acceptable (APPROVED by the project owner).** The reason comes from the protocol: SPEC §4.1 step 3 (OBSERVED): the QR payload is {1 pairing key, 2 AES key, 3 HMAC key}. Those AES/HMAC keys are the long-lived payload keys used for all browser↔phone encryption (§5). Anyone holding the QR image, including a model context, a chat transcript, or a log, can decrypt that session's traffic. The official client only shows it briefly on a local screen. Recommended options:
     - (a) Serve the QR out-of-band through a short-lived, single-use URL the user opens directly. It should expire with the QR expiry or sooner, and nothing should be cached.
     - (b) Prefer Google-account pairing. There, the payload keys come from the UKEY2 handshake and are never displayed, and the user only matches an emoji, which is safe to show in chat (SPEC §4.2, VERIFIED-LIVE two-step SignInGaia). The trade-off is that Gaia mode is cookie-authenticated (`SAPISIDHASH`, `withCredentials`, §3 OBSERVED), so it needs the user's Google web session on the host.
     - Also, `start_pairing` currently saves the token and keys before the phone has scanned, so a partially paired session stays on disk. Clean it up on QR expiry. That is an implementation note, not a protocol fact.
- **Owner direction (binding):** Switch the **primary pairing path to Google-account (Gaia) pairing**, per IMPLEMENTATION-PLAN Phase 1 (SignInGaia two-step emoji flow, SPEC §4.2 / §0.1, VERIFIED-LIVE). QR pairing may stay only as a **secondary** option, and only if the QR is served out-of-band (a short-lived, single-use URL the user opens directly). The QR image, URL payload, pairing key and AES/HMAC keys must **never** be returned in MCP tool output or written to logs. Update `PRIVACY.md` to match (it currently says the host receives the pairing QR code).
- **Spec change:** README rule 6 to add a clarification for hosted MCP servers. SPEC.md §4.1 step 3 to add "QR payload contains long-lived payload keys; treat as a secret".

### Q-008 — 2026-10-18 — SendMessage/inbound envelope encodings, qN/deadline table, QR-mode destination (GitHub #8)

- **From:** implementer
- **Context:** SPEC.md §6.1(a)(b), §6.2; IMPLEMENTATION-PLAN Phase 2

### A-008 — 2026-10-18

- **Answer summary:**
  1. **Message.f12 encoding: INFERRED, not confirmed.** Our capture walker reported the envelope inside f12 as protobuf fields with byte lengths: f1 = 36 B, f2 = action number, f5 = opaque blob (for example 295 B for a 42-character text), f6 = 36 B. That fits a base64 string holding a binary-protobuf envelope inside the JSPB `SendMessage`, not a nested JSPB array. The records don't say so explicitly. Envelope f1 (request ID) and f6 (session ID) are 36-byte values, which is the length of a UUID in text form (the text form is INFERRED). Envelope f3 is the clear protobuf of the few unencrypted actions (44, 45, 48) and is otherwise empty (OBSERVED, §6.1(a)). f5 is opaque ciphertext bytes (VERIFIED-LIVE).
  2. **qN table:** the only recorded values are qN = 2 (most actions), 16 (with action 1) and 20 (with action 44), all VERIFIED-LIVE. qN for any other action is UNVERIFIED. **Deadline (f5):** 300000000 µs (5 min) and 86400000000 µs (24 h) both VERIFIED-LIVE. Which action takes which deadline isn't recorded. In the JS, a `864E5` (24 h) value accompanies most READ actions (§7), so READ → 24 h and WRITE → 5 min is a reasonable INFERRED working rule. **f9:** a single 36-byte value with UNVERIFIED meaning. When it is present isn't recorded.
  3. **QR-mode destination: INFERRED yes.** SendMessage f1 = destination device identity (VERIFIED-LIVE in Gaia mode). In QR mode the paired event's f4.1 is the phone identity that the client stores as `tachyon_auth_dest_id` (OBSERVED, §4.1 step 4). Send that identity exactly as received, `[type, sourceId, network]`, without rewriting its network string. Note that the owner has made Gaia the primary path (see #7).
  4. **Inbound path: UNVERIFIED.** No stream bodies were retained (§0.1 item 10). From the JS (OBSERVED, §6.2): the response envelope's f5 holds the encrypted response, f9 = true means "session preempted", and responses are matched by request ID (INFERRED). The IDs passed to `AckMessages` are repeated UUID strings in f2 (VERIFIED-LIVE). Which inbound field supplies them is UNVERIFIED. Our working hypothesis is the inbound relay Message.f1, mirroring outbound (INFERRED). Whether the inbound Message type is also 19 is UNVERIFIED.
- **How to test with your own client:** In DevTools, look at the JSPB type of the official client's Message.f12 in a `SendMessage` body (string or array). For the inbound path, capture `ReceiveMessages` with the DevTools response view or a local proxy (HAR drops streams). Log element shapes, field paths and lengths only. Match outgoing request IDs to inbound elements by their 36-character value.
- **Spec change:** SPEC.md §6.1 and §6.2 revised (spec PR).

### Q-009 — 2026-10-18 — Plaintext request/response layouts for actions 16, 31, 1, 2, 9, 3, 17 (GitHub #9)

- **From:** implementer
- **Context:** SPEC.md §7; IMPLEMENTATION-PLAN Phases 2–3

### A-009 — 2026-10-18

- **Answer summary:** Everything below is OBSERVED in the JS only (SPEC §7). None of these plaintext layouts has been checked on the wire, because f5 is encrypted. Field numbers that aren't listed are not recorded, so keep them as spec gaps.
  - **Plaintext encoding: INFERRED binary protobuf.** The unencrypted actions put "clear protobuf" in envelope f3 (§5/§6.1), and f5 doesn't parse as JSPB text. Confirm this with the known-plaintext test in OPEN-QUESTIONS §2.
  - **16 (activate):** request ID = the new session ID. It carries a timestamp, but the field number and units aren't recorded (the µs convention of `RegisterRefresh` is not proof). It is sent together with 31 when the browser becomes active [B@1053783]. Seen live once in the pairing capture.
  - **31 (capabilities):** a boolean in the response gates send, create-conversation and group features. Request and response field numbers aren't recorded. Seen live once.
  - **1 (list conversations):** the request carries a count, a folder/status filter and an optional cursor, but the field numbers and enum values aren't recorded. Response f2 = repeated conversations, f5 = cursor [B@~1050800].
  - **2 (list messages):** the request carries a conversation ID, a cursor and a count, but the field numbers aren't recorded. Response f2 = repeated messages, f5 = cursor. Throws "Conversation not found" on an empty result. VERIFIED-LIVE as an action (once, after action 9).
  - **9 (get-or-create conversation):** takes a list of destinations (address identities), with an optional group name in f3. The destination list layout isn't recorded. VERIFIED-LIVE as an action (f5 opaque, 86 B).
  - **3 (send):** request f2 = conversation ID, f5 = client temporary message ID, optional f4 = SIM/sender, optional boolean f6, plus the message content in a field that isn't recorded. Response f2 = message ID, f3 = status. The status enum values aren't recorded [B@1063354].
  - **17 (ack):** empty request, sent after message updates are processed [B@1053193]. Not seen live. Relay `AckMessages` was seen instead.
  - **38:** f1 = message ID, f2 = emoji payload, f3 = add/remove/switch enum, optional f4 = SIM. Confirmed as stated in §7 (JS), but the inner layout hasn't been checked live.
- **How to test with your own client:** Once your session keys work (Gaia: derive them per §4.2), decrypt the responses to your own requests and walk them without a schema. Plant known values (a fixture text such as `test-vector-001`, a known count such as 7, a self-chat conversation) and find which field holds each one. Google's public bundle at the cited offsets is an allowed source under rule 2. Use self-chat only.
- **Spec change:** SPEC.md §7 annotated (spec PR); new OPEN-QUESTIONS item.

### Q-010 — 2026-10-18 — Conversation and Message object schemas (GitHub #10)

- **From:** implementer
- **Context:** SPEC.md §7 (actions 1, 2), §8

### A-010 — 2026-10-18

- **Answer summary: UNVERIFIED. The spec team has no field-level schema for Conversation or Message.** What we do have:
  - The lists are carried in action 1 / action 2 response f2, with cursor f5 (OBSERVED).
  - Conversations and messages have string IDs (the conversation ID is a request field of actions 2, 3, 10, 15, 19 and 21; the message ID is the response f2 of action 3 and request f1 of action 38).
  - Updates pushed by the phone arrive encrypted on the stream. The client names `CONVERSATION_UPDATE`, `MESSAGE_UPDATE`, `NEW_RCS_MESSAGE_EVENTS` and `RCS_MESSAGE_STATUS_UPDATE_EVENTS` exist (OBSERVED), but their mapping onto the wire and whether they share the list schemas are both UNVERIFIED.
  - Timestamp units: µs is used elsewhere in the protocol (TTL, RegisterRefresh), but that is not proof for these objects.
- **How to test with your own client:** After decryption works, call action 1 and then action 2 on a self-chat. Send yourself a known text from the phone at a known time, and react to it once. Diff the decrypted objects before and after to find the text, timestamp, sender, direction and status fields. Record field numbers, types and lengths in QUESTIONS.md (no message content from real chats), and we will fold them into SPEC.md §7.
- **Spec change:** new OPEN-QUESTIONS item (spec PR).

### Q-011 — 2026-10-18 — QR-mode lifecycle: refresh, revoke, keep-alive, activation (GitHub #11)

- **From:** implementer
- **Context:** SPEC.md §4.1 step 6, §4.3, §8, §10

### A-011 — 2026-10-18

- **Answer summary:** The owner has made Google-account (Gaia) pairing the primary path (see #7), so the QR-only parts below are lower priority. Items 3–5 apply to both modes.
  1. **RegisterRefresh in QR mode:** the layout in §4.3 is OBSERVED in the JS, and the Registration client is JSPB (OBSERVED). The QR-mode relay base is `https://instantmessaging-pa.googleapis.com` (flag `solGAe`, OBSERVED); that it also serves Registration in QR mode is INFERRED. The network string is `"Bugle"` in QR mode (OBSERVED in JS). Every relay request embeds the auth header with the current bearer token (OBSERVED, §4.3), and AuthMessage f6 = token bytes is VERIFIED-LIVE in Gaia mode. Refresh has not been seen live in either mode.
  2. **RevokeRelayPairing:** f2 = the browser device identity (OBSERVED). Whether it is the full identity message or only the source-ID string is UNVERIFIED. That f1 is the auth header is INFERRED from the general rule in §4.3. In Gaia mode, unpairing uses `Registration/Unregister` instead (the mapping is INFERRED).
  3. **Keep-alive:** UNVERIFIED. Page config `M4QZzf` = 10000 ms is INFERRED to be a heartbeat or ping cadence. Action 48 is an unencrypted empty request to explicit targets, possibly a ping (UNVERIFIED). It was seen twice in the live pairing capture. How long a stream lives before the server closes it is UNVERIFIED. A `PullMessages` fallback exists (OBSERVED).
  4. **Activation:** OBSERVED in the JS. On becoming the active client, the browser picks a new session ID, sends action 16 with that ID as its request ID, and requests capabilities with action 31 [B@1053783]. Both were seen once in the live pairing capture. Whether actions 1 and 2 go unanswered without them is UNVERIFIED, so do the 16 → 31 sequence before anything else.
  5. **Phone-initiated unpair:** UNVERIFIED. The pairing container appears to have a revocation branch alongside f4 "paired" (INFERRED, §10).
- **How to test with your own client:** Keep a stream open for at least 15 minutes and log the route/type numbers and lengths of what arrives (OPEN-QUESTIONS §1), and whether the server closes the stream and when. Try sending action 1 before 16/31 once and record the result. Unpair from the phone's Device pairing screen and record the last stream items.
- **Spec change:** SPEC.md §4.3, §8 and §10 annotated (spec PR).
