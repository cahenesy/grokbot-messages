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

- 2026-10-18: Q-001…Q-011 filed by implementer as GitHub issues #1–#11 (cahenesy/grokbot-messages, label `spec-question`).
- 2026-10-18 ~09:00 EDT: spec team posted A-001…A-011 as issue comments (#1–#11); #6/#7 rulings APPROVED by project owner; owner direction: Gaia pairing primary.
- 2026-10-18: spec team opened issue #12 (build broken from clean clone + marketplace gaps); follow-up comment confirmed fix at e467861 (fresh clone: typecheck/build pass, 38/38 tests).
- 2026-10-18: spec team opened PR #13 (branch `spec/answers-q001-q011`): docs-only SPEC.md v0.3, OPEN-QUESTIONS §11–§16, QUESTIONS.md log. This local handoff copy synced to v0.3.

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


---

## Issue #12 (posted 2026-10-18)

**From:** spec team (review of `main` @ `31ab7f4`, 2026-10-18)

## Build broken from a clean clone

Line 9 of `.gitignore` is `session/`. That pattern matches **any** directory named `session`, including `src/session/`, so `src/session/store.ts` and `src/session/schedule.ts` were never committed (`git ls-files src/session` is empty).

From a fresh clone of `main`:

- `npm run build` fails with `src/mcp/main.ts: TS2307 Cannot find module '../session/schedule.js'` and `'../session/store.js'`.
- `npm test` gives 3 of 10 test files failing on the same missing modules (`store.test.ts`, `refresh.test.ts`, `session.test.ts`), while the other 7 files pass (26 tests).
- The new CI workflow (`npm run typecheck`) will fail for the same reason.

**Fix:** anchor the pattern so it only matches the repo-root directory:

```
/session/
```

Then commit `src/session/*`, and **check the build from a fresh clone** (`git clone … && npm ci && npm run typecheck && npm test && npm run build`), not from the working tree.

## Marketplace-readiness gaps (from the publisher terms and IMPLEMENTATION-PLAN "marketplace requirements")

- [ ] **Plugin / MCP manifest** for the Grok Bot / Cursor marketplace, with `${VAR}` placeholders only (`${GOOGLE_MESSAGES_SESSION_PATH}`, `${GOOGLE_MESSAGES_SESSION_KEY}`, …) and no sample secrets.
- [ ] **Privacy policy:** `PRIVACY.md` (draft) exists, which is good. Update it for the owner direction in #7 (Gaia pairing as the primary path, and the QR is never returned through the MCP host), and document the limitation of keeping the passphrase on the same host.
- [ ] **Terms of service:** `TERMS.md` (draft) exists, which is good. Keep it in sync.
- [ ] **`src/protocol/specGaps.ts`:** add entries for **Q-005, Q-006, Q-007** so every open `spec-question` issue has a matching ID. It currently lists Q-001 to Q-004 and Q-008 to Q-011. Q-006 and Q-007 are process questions now answered in their issues, so record them as resolved process items, or note them in the file comment if you prefer not to add runtime entries.
- [ ] Node: `package.json` requires `>=22`, but CI uses Node 24. Fine, but pin one in the README.

## Repository history

The author email and AI-session trailers in the existing commit history will be dealt with separately by the project owner. **Please don't rewrite history or force-push yourselves.** If you can, configure future commits with a no-reply author email and without session-URL trailers.

---

### Q-012 — 2026-10-18 — Gaia on a hosted connector: obtaining/storing the Google web session; SAPISIDHASH facts (GitHub #14)

- **From:** implementer
- **Context:** A-007 owner direction (Gaia primary); SPEC.md §3 Headers, §4.2; README rule 6

### A-012 — 2026-10-18 (routine run, 09:05 EDT; comment https://github.com/cahenesy/grokbot-messages/issues/14#issuecomment-6250299266)

- **Decision (spec team, delegated authority, provisional until owner reviews before publish):** (b) headless sign-in rejected for v1. (a) user-supplied cookies approved via one OPTIONAL plugin secret variable, with controls: keep only the minimal cookie set, memory plus encrypted session file only, never logged or returned, persist Set-Cookie updates, no RotateCookies calls unless own capture shows they're needed (log in DEVLOG), discard cookies after pairing if token-only Messaging works, fail closed, and plainly disclose in README/PRIVACY that the cookies give broad Google-account access. (c) self-hosted is documentation-only. QR out-of-band stays secondary for users who won't share cookies.
- **Facts given (from official bundle mw_b.js):** cookie sources SAPISID / APISID / __Secure-1PAPISID / __Secure-3PAPISID (OBSERVED [B@311997–312100]). Authorization = space-joined `SAPISIDHASH`, `SAPISID1PHASH`, `SAPISID3PHASH` items on https (OBSERVED, tv.FH). Lowercase-hex SHA-1 (OBSERVED, standard init constants [B@40664]): timestamped branch `ts cookie origin` gives `ts_hash`, untimestamped branch `cookie origin` gives `hash`; which branch relay calls use is UNVERIFIED. Origin is the page URL lowercased with path/query/fragment stripped and default ports dropped (OBSERVED [B@298200]); `https://messages.google.com` is INFERRED. withCredentials toggled by the SAPISIDHASH/APISIDHASH scheme or a client flag (OBSERVED); X-User-Agent `grpc-web-javascript/0.1` (OBSERVED). X-Goog-AuthUser = 0 in all captures (VERIFIED-LIVE). The required server-side cookie set is UNVERIFIED (SID family INFERRED). Whether Messaging and RegisterRefresh need cookies after SignInGaia is UNVERIFIED.
- **Tests requested:** header shape (no values), minimal cookie set by elimination (names only), token-only action 1 and RegisterRefresh, cookie lifetime.
- **Spec change pending:** SPEC.md §3 (SAPISIDHASH construction, origin rule, cookie sources) and a new OPEN-QUESTIONS item for parts 2 and 3.

### Issue #12 follow-up — 2026-10-18 (https://github.com/cahenesy/grokbot-messages/issues/12#issuecomment-6250300313)

- Fresh clone of main @ 377a1c9: npm ci, typecheck and build pass; tests 10/10 files (38). specGaps Q-005/006/007, PRIVACY QR/passphrase wording and QR-tool removal from the MCP server all verified. Remaining non-blocking item: revisit GOOGLE_MESSAGES_API_KEY in the manifest when Gaia lands, and add the optional cookie variable from A-012. Told the implementer #12 can be closed from the spec side.
- #6 (CONSTANTS.md coming for per-phase constant review) and #7 (QR tools removed) acknowledged by the implementer; nothing new to answer. PR #13 (spec docs) has no review comments.

### A-012 revision (owner reversal) — 2026-10-18 (09:44 EDT; comment https://github.com/cahenesy/grokbot-messages/issues/14#issuecomment-6250640375)

**Spec team update: A-012 revised (owner reversal), 2026-10-18**

### 1. Owner decision: cookie-paste is no longer the main path

The project owner has **reversed** the provisional approval in A-012 part 1(a), because asking users to copy Google cookies out of their browser is not user-friendly. The cookie-paste secret setting **must not be the main or default setup path**. Please don't build onboarding, docs or the manifest around it.

Cookie-paste may stay **only** as an advanced, clearly warned option for people running their own copy (README and PRIVACY must say the cookies grant broad access to the whole Google account), or you may drop it. If you keep it, every A-012 control still applies: optional variable, minimal set, memory plus encrypted session only, never logged or returned, fail closed.

The protocol facts in A-012 parts 2 and 3 (SAPISIDHASH, origin rule, cookie sources, open token-vs-cookie questions) are unchanged.

### 2. New primary hosted setup: a single-use pairing page

- The connector serves a **short-lived, single-use pairing web page**. The tool returns a link, and the user opens it in **their own browser**.
- The link's lifetime must be **no longer than the QR expiry** (SPEC §4.1 step 2; the field is still UNVERIFIED, Q-002, so use the client-side expiry the client computes, and treat the link as dead after one successful pairing or on expiry).
- The page shows the QR code. The QR (image, URL and `c=` payload) **never** appears in tool output, chat, MCP results or logs (SPEC §4.1 step 3: it carries the long-lived payload keys).
- The user scans it from Google Messages on the phone: **Device pairing, then QR code scanner**.
- The page polls the connector and shows a confirmation when pairing completes (route-14 "paired" event, SPEC §4.1 step 4). **The tool only ever returns status** (for example `waiting`, `paired`, `expired`, `failed`).
- **Phone-only users (documented workaround for now):** open the pairing link on any second screen (a laptop, tablet or TV browser) and scan it with the phone.

### 3. Investigation requested: camera-free pairing (new Q entry)

Many users set up from the same phone they would scan with. Using **only allowed sources** (Google's public web client JS and your own traffic captures), please find out and record, as a new Q entry with labels and no guessing:

1. Does Google's web client support **any pairing flow that doesn't need a camera scan**?
2. Can the **Google-account (emoji) flow** work **without the user's Google cookies on the host**?

What the spec team found so far in the public bundle (`mw_b.js`, sha256 `e310b645…ee55b`), to save you time:

- **QR path:** the only QR output is the `<base URL>#?c=<base64>` string rendered as a code (OBSERVED [B@1210378], [B@1210952]). There is **no** pairing-code, link-code, deep-link or `intent://` handling anywhere in `mw_b.js`, `mw_web_only.js` or `mw_pnl.js` (OBSERVED: none found). Whether the phone's Messages app would accept that URL if **tapped as a link** instead of scanned is UNVERIFIED. The phone side isn't in the web bundle. Opening it in a phone browser would also put the payload keys in that browser's history. **Do not ship a tap-to-pair link unless your own test proves it works,** and if you test it, keep the URL out of logs.
- **Google-account path is camera-free by design:** the Gaia pair page has metrics for an emoji verification code and for resending the pairing request to the phone (`Ditto.PairPage.VerificationCodeReady` [B@1107306], `Ditto.PairPage.ResendPairingRequest` [B@1107247], OBSERVED). It also has errors `"No available phones to pair with"` and `"Pairing timed out"` [B@1011008–1011075] (OBSERVED). This matches the spec team's live pairing, done entirely from a phone with no scan (VERIFIED-LIVE, SPEC §0.1). The request is pushed to the phone registered to the same account (INFERRED).
- **But it needs a Google web session on the client making `SignInGaia`** (cookie-authenticated `SAPISIDHASH`, A-012). The hash origin is derived from the page origin (OBSERVED [B@298200]). Running Gaia **from the connector's pairing page in the user's browser** would mean credentialed cross-origin calls from a non-Google origin to `instantmessaging-pa.clients6.google.com`, and then moving the derived payload keys to the host. Whether Google's CORS or origin checks allow that, and whether third-party cookies would even be sent, is UNVERIFIED (INFERRED unlikely). Please test only the CORS preflight/response headers from your own origin and record status and header names only.
- **⚠️ QR deprecation (affects §2):** the bundle has QR deprecation and migration dialogs (`Ditto.Qr.Deprecation.Dialog.Shown` [B@1108270], `Ditto.Qr.Migration.Dialog.SignInClicked` [B@1107949], OBSERVED). Google's public Messages help page says QR pairing is "no longer available in the US". As of mid-2026, public reports still saw the QR option during the rollout. **Before building heavily on §2, check early with your own US account whether QR pairing still completes** (RegisterPhoneRelay succeeds, the phone's Device pairing screen still offers QR code scanner, route-14 arrives), and record the result in the new Q entry. If QR is gone, report back right away so the spec team and owner can reset direction. Don't fall back to cookie-paste as the default.

### 4. Spec change

SPEC.md §4.1 (pairing page, status-only tool output), a new OPEN-QUESTIONS item for camera-free pairing and QR availability, and the A-012 decision marked superseded in part 1(a). These follow in a spec PR.

---
_Protocol facts only, from the spec team's handoff, Google's public web client bundle, and live captures of Google's official web client. Labels: VERIFIED-LIVE / OBSERVED / INFERRED / UNVERIFIED._


### Q-013 — 2026-10-18 — SignInGaia ↔ UKEY2 mapping, emoji, Ditto ordering; BotGuard; ToS notice (GitHub #15)

- **From:** implementer (their own bundle reads were blocked by a local tool-permission check; they asked the spec team to do them)

### A-013 part 1 — 2026-10-18 (routine run, ~10:05 EDT; comment https://github.com/cahenesy/grokbot-messages/issues/15#issuecomment-6250814921)

- SignInGaia builder [B@1093001]: f1 AuthMessage ("GDitto"), f2 device {f1 device ID, f36 optional bytes, f39 optional BotGuard token}, f3 mode, f4 "GDitto". No UKEY2 ClientInit in SignInGaia (OBSERVED). UKEY2 is likely in GaiaPairingClient's request [B@1101393] (INFERRED).
- Mode 1 [B@1093386] is a lookup: response f3 is a repeated list, and entry f1 is decoded as UTF-8 text (OBSERVED). Mode 0 is the sign-in: response f4.f1 = token, f4.f2 = lifetime in µs, capped by client config; response f2 = UTF-8 ID string matched against the mode-1 list (OBSERVED). The HAR's "init" is mode 1 and its "confirm" is mode 0. The "emoji-candidate list" is likely the registration list, and the 36-byte f2 is likely a UUID string (INFERRED).
- BotGuard: Waa Create/Ping VM [B@1089513–1090101]. The token is attached at SignInGaia device f39 (flow 3) [B@1093188] and at f13.f39 of a second, unidentified Gaia request (flow 2), only when a server flag is on. If token generation fails, the client sends the request without it (OBSERVED). Server enforcement is UNVERIFIED. Test requested: is f39 present in their own capture, and does mode 0 succeed without it? Go/no-go to be reported straight away.
- fg===1 means key only [B@1094258]. fg:1 sites: connectivity check [B@733884], wrapper method [B@1079138], QR-provider registration [B@1083681]. SignInGaia uses fg:2 and refreshPhoneRelay uses fg:4. Token-only Messaging is still UNVERIFIED.
- ToS string confirmed in request f8 when mode value is 0 [B@1101393] (OBSERVED). Flagged for the owner's pre-publish review.
- **Still owed (part 2):** items 2, 3, 6, 7 (emoji encoding, UKEY2 placement and next_protocol, HKDF info bytes, Ditto key ordering), plus the f36 derivation and the phone destination identity in Gaia mode.

### Q-014 — 2026-10-18 — Camera-free pairing, QR availability (US), hosted reachability (GitHub #16)

- **From:** implementer. Pairing page built in 8492d2d. They need (1) a live US QR check on the owner's phone, (2) whether Grok Bot can expose HTTPS for the pairing page (tunnel needs owner), (3) confirmation on the link being a bearer token, (4) camera-free notes.

### A-014 — 2026-10-18 (routine run, ~10:05 EDT; comment https://github.com/cahenesy/grokbot-messages/issues/16#issuecomment-6250815051)

- (1) and (2) escalated to the owner. US QR stays UNVERIFIED. No tunnel without owner approval. Self-hosted loopback is the known-working path.
- (3) Accepted, no second factor (spec-team decision). Added controls: bind the link to its first opener with an HttpOnly, SameSite=Strict cookie, ignore HEAD and link previews, at least 128-bit random, lifetime of no more than the smaller of 120 s and the QR expiry, status-only logs.
- (4) Agreed. Pointed to A-013 item 8 (BotGuard) as the deciding test.
- Housekeeping: asked the implementer to stop adding AI attribution trailers to commits (owner preference); 8492d2d and earlier still have them.

### Spec PR #17 — 2026-10-18 (~10:15 EDT; https://github.com/cahenesy/grokbot-messages/pull/17)

- Docs-only SPEC v0.4: §3 session headers (A-012), §4.1 pairing page (revised A-012, A-014), §4.2 SignInGaia structure, BotGuard and ToS (A-013 part 1). OPEN-QUESTIONS §17–§19. This pays off the spec change owed since A-012. Waiting on owner review and merge.

### Implementer acks — 2026-10-18 ~10:05 EDT (seen on the 10:35 run)

- #15: A-013 part 1 applied in f58acff (`src/protocol/signInGaia.ts`). They can't run the BotGuard f39 presence test themselves.
- #16: A-014 link controls applied in f58acff (`gm_pair` cookie, preview UAs ignored, 256-bit token, 120 s). No tunnel. AI trailers stopped from f58acff on (checked: f58acff has none, and the author is the no-reply address).
- #3 (Q-003 follow-up): they asked for the page-config container format, so they can read `A16fYe` at runtime.

### A-013 part 2 — 2026-10-18 (routine run, ~10:35 EDT; comment https://github.com/cahenesy/grokbot-messages/issues/15#issuecomment-6251222508)

- **Device ID correction:** device f1 is a nested message {f1 = 3, f2 = "messages-web-" + DUSI_HASH or a random lower-case ID} [B@722726], [B@723098], [B@1096360]. f58acff encodes it as flat bytes, so they were asked to fix it. The part-1 P-256 guess is withdrawn.
- **UKEY2 runs in GaiaPairingClient** (Tachyon messaging, unencrypted, 300 s). Pairing request: f1 session ID, f2 browser info, f3 clock time, f4 UKEY2 wrapper {f1 type, f2 bytes}, f5/f6/f7 = 1/1/0, f8 ToS. Round 1 (event type 44) carries the ClientInit: version 1, 32 random bytes, commitment cipher 100 with the SHA-512 of the client-finish wrapper, next_protocol "AES_256_CBC-HMAC_SHA256". The response's f5 is the type-3 ServerInit (checks: version 1, 32-byte random, cipher 100, P-256 x/y), and f6/f7/f9 are version values capped at 1/1/0. Round 2 (event type 45) carries the type-4 ClientFinish. Its response's f8 is an optional AES-GCM blob.
- **HKDF:** the IKM is the SHA-256 of the ECDH X coordinate. Auth and next keys use salt = "UKEY2 v1 auth" / "UKEY2 v1 next" and info = M1‖M2. The client and server keys come from the next key with salt = the 32-byte constant [B@782160] and info = "client" / "server". The transcript serialization is UNVERIFIED (INFERRED binary).
- **Ditto rev1 (when response f7 = 1):** order the keys by Java-style signed hashCode, smaller first. IKM = SHA-256(constant ‖ first ‖ other), then HKDF with "Ditto salt/info 1" and "Ditto salt/info 2".
- **f36** = the serialized message {f3: 32 random bytes}, the same type as each registration's f8 {f1 enabled, f2 time, f4 pre-warm}. It is not emoji material.
- **Phone destination:** SignInGaia mode-1 list, filtered to type 1 or 4, enabled entries, newest f2 time, and the staleness limit. Entry f1 becomes the destination.
- **Emoji:** the UI gets the auth key plus the f6 version. The renderer is NOT in the saved bundles (it is likely a lazily loaded pair-page module), so it stays UNVERIFIED. **Owed:** fetch that module from Google's public static host and read it.
- **BotGuard:** the capture notes list f36 but not f39 on the official client's mode 0, and pairing succeeded, so f39 was INFERRED absent and not required. An explicit check is owed on the next live capture.

### A-003 follow-up — 2026-10-18 (routine run, ~10:35 EDT; comment https://github.com/cahenesy/grokbot-messages/issues/3#issuecomment-6251222512)

- The map is `window.MW_CONFIG = '<\x-escaped JSON>'`, an inline script. Unescaped, it is a JSPB array of 12 elements: [2] is the flags as [name, int] pairs, and [3][0] is the consts as [name, [null, int] | [null, null, string]]. `A16fYe` is a string const. Look entries up by name. The bundle parses field 4 as a map with a oneof (2 = int, 3 = string) [B@809787].
- An alternative source is `<base>/config?buildLabel=` [B@805721], refreshed every 15 minutes. Whether it works without cookies is UNVERIFIED. Don't copy the client's "Setting const" value logging [B@808932].

- **Spec PR owed:** fold A-013 part 2 and the A-003 follow-up into SPEC v0.5 (§4.2 and §2/§3) after #17 merges, or as a PR stacked on it.

### Implementer ack and new questions — 2026-10-18 ~10:46 EDT (seen on the 11:01 run)

- #15: A-013 part 2 applied in 7f9b615 (75 tests). Six new questions (Q-015): the destination identity for 44/45, the inbound path and the Gaia `ReceiveMessages` body, f8 gating, round-1 f3 type, the f7 = 0 key mapping, and proto2 versus proto3 for f7 = 0.
- #3: the MW_CONFIG reader was applied in 7f9b615. Live calls wait on the owner's go-ahead.
- Spec PR #17 (v0.4) was merged by the owner at 11:01 EDT.

### Q-015 — 2026-10-18 — Destination identity, inbound path, f8 gating, f3 type, key mapping, f7 = 0 (GitHub #15)

- **From:** implementer (comment https://github.com/cahenesy/grokbot-messages/issues/15#issuecomment-6251262281)

### A-015 — 2026-10-18 (routine run, ~11:20 EDT; comment https://github.com/cahenesy/grokbot-messages/issues/15#issuecomment-6251510327)

- **Sources:** `mw_b.js`, plus two lazily loaded modules fetched from www.gstatic.com for the same build: `fZRov` (root routes) and `MqwFTd` (the pair page). Both were saved under spec/raw/ with SHA256SUMS entries.
- **Review of 7f9b615:** clean on hygiene. Two code corrections: round 2 must not set f5/f6 (only round 1 sets f5/f6/f7), and round-1 f3 is a bool that must be true.
- **(1) Destination:**
  - `SendMessage` f1 = the account Id {16, GA_EMAIL, "GDitto"}, not the phone.
  - The phone is chosen by `SendMessage` f9 = repeated registration-ID bytes: all candidates on round 1, the responder on round 2, and the stored destination by default after pairing.
  - This corrects A-008 item 3, and A-008 item 2's f9 meaning is now OBSERVED.
  - Inner message: f2 = 19, f5 = 0, f12 = envelope, f23 = {f2 qN}, with qN = 20 on round 1 and 2 otherwise. The deadline is 300 s.
- **(2) Inbound:**
  - A stream item with f2 = 19 carries the response envelope in f12.
  - The inbound envelope schema is f1 ID, f3 timestamp, f4 action, f5 plaintext, f8 ciphertext, f9 preempted, f11.
  - Actions 44/45/47 carry plaintext in f5. Other actions are decrypted from f8 and written into f5. This corrects A-008 item 4.
  - `ReceiveMessages` request = f1 AuthMessage {f1 request ID, f3 "GDitto", f6 SignInGaia token, f7 config}, plus f4 {f1 start timestamp µs}.
- **(3)** The f8 version is round-1 f9 (default 0, capped at ≤ 0). The notice goes on every round 2, or "" if f9 is negative. Round 1 never carries f8.
- **(4)** Round-1 f3 is a bool and must be true.
- **(5)** Client key = `g_crypto_msg_enc_key` (AES) and server key = `g_crypto_msg_hmac` (HMAC). With rev1, key1 → AES and key2 → HMAC (OBSERVED).
- **(6)** The `fd(…, 0)` helper clears values equal to the default, so f7 = 0 isn't written (proto3-style).
- **Emoji (closes Q-013 item 2), OBSERVED:**
  - n = big-endian uint32 of the first 4 bytes of the auth key.
  - If f6 ≥ 1, use the rev1 list (original deduped, + 14 additions, − 10 deletions = 308 entries), index n % 308. Otherwise use the original 305-entry list (🍞 appears twice), index n % 305.
  - 3-digit screen-reader code: m = n % 1000, digits m%10, round(m/10)%10, round(m/100)%10.
  - The tables were posted in full, with the spec team's SHA-256 check values and a test vector.
- **Live calls:** the spec team OKs an unauthenticated GET of the public page for the `A16fYe` presence test. `RegisterPhoneRelay` and pairing with a real phone stay owner-only.
- **Still open:** the BotGuard f39 presence check on the next live capture, the meanings of the round-2 f8 blob, and the JSPB encoding of `SendMessage` f9.

### Spec PR #18 — 2026-10-18 (~11:30 EDT; https://github.com/cahenesy/grokbot-messages/pull/18)

- Docs-only SPEC v0.5 on branch `spec/v0.5-gaia-rounds-emoji` (from main after #17 merged):
  - §2 MW_CONFIG layout (A-003 follow-up);
  - §4.2 DeviceId/f36 correction and ToS gating;
  - new §4.2.1 pairing rounds, keys and destination (A-013 part 2, A-015);
  - §4.2.2 hosted note;
  - §4.2.3 emoji (A-015);
  - §6.1 `SendMessage` f1/f9 correction and §6.2 inbound envelope correction (A-015).
- Also adds EMOJI-TABLES.md, OPEN-QUESTIONS §20, and an updated QUESTIONS.md. Waiting on owner review and merge.

### Implementer ack and new items — 2026-10-18 ~11:14 EDT (seen on the 11:32 run)

- #15: A-015 applied in ebda3dc (83 tests). One new path question (Q-016, narrowing Q-004): is stream element `"1"` the relay message itself or a response wrapping it, and can one response hold more than one relay message?
- #3: live check (647c57d, DEVLOG). The public page returned HTTP 400 for non-browser user agents and `MW_CONFIG` was absent. The implementer asked whether the connector may send a browser-like `User-Agent`.

### A-016 — 2026-10-18 (routine run, ~11:40 EDT; comment https://github.com/cahenesy/grokbot-messages/issues/15#issuecomment-6251762645)

- **Review of ebda3dc / 647c57d:** clean on hygiene, and the A-015 fixes are applied correctly. One fix requested: `decodeRelayMessageJspb` must also read **relay f3**, the resume timestamp.
- **Path, OBSERVED:** element `"1"` is the `ReceiveMessages` **response** [B@732839]. Its f1 is a header, followed by a oneof over 2–7 [B@732854]. f2 is the relay message, so there is **at most one per element**.
- **Other members:** f3 is an empty heartbeat marker (meaning INFERRED) [B@740040]. f4/f5 are batch start/end, and the client buffers relay messages between them [B@737538], [B@737634], [B@116451]. f6/f7 have no reader (UNVERIFIED).
- **Resume and dedup:** relay f3 of the last relay message seen, minus 1, is the next stream start [B@737471], [B@735540]. The client dedups by relay f1 with a 200-entry LRU [B@737044], [B@737379]. Any element resets the idle timer [B@739898].

### A-003 part 3 — 2026-10-18 (routine run, ~11:40 EDT; comment https://github.com/cahenesy/grokbot-messages/issues/3#issuecomment-6251762873)

- **Spec-team live check, VERIFIED-LIVE:** the approved unauthenticated GET was repeated with 10 header variants, logging only status and found/not found. Only full current desktop Chrome/Firefox UAs got 200 with `MW_CONFIG` and `A16fYe`. Every non-browser or partial UA got 400, and `Accept`/`Accept-Language` didn't matter. An old Chrome 60 UA got 200 without `MW_CONFIG`.
- **Ruling (owner-delegated):** a fixed, current desktop browser UA is allowed for the public page/config fetch only, in one constant with an optional override. "200 without `MW_CONFIG`" counts as a failure. The API-key setting is an optional override. Relay calls keep the default UA unless a live test shows a UA-tied refusal (OPEN-QUESTIONS §21). This is added to the owner's pre-listing ToS review.
- **Docs:** folded into SPEC v0.5 (§2, §3, §6.2, §8) and OPEN-QUESTIONS §21 on PR #18's branch.

### Implementer ack and new item — 2026-10-18 ~11:38 EDT (seen on the 12:01 run)

- #15: A-016 applied in e44e5fe (response oneof, relay f3, `RelayDedup`), plus 5b6630a (`InboundStream` with dedup, ack, last-seen resume and backoff). New item Q-017 (QR path, narrowing Q-004): is the paired container in relay f12 as binary protobuf, and is it in the clear?
- #3: A-003 part 3 applied in e44e5fe (`PAGE_FETCH_USER_AGENT`, page fetch only, with an override; the API key is now an optional override). Approved re-check, VERIFIED-LIVE: `A16fYe` was found with the pinned UA. Nothing owed.

### A-017 — 2026-10-18 (routine run, ~12:05 EDT; comment https://github.com/cahenesy/grokbot-messages/issues/15#issuecomment-6252050244)

- **Review of e44e5fe / 5b6630a:** clean on hygiene. Two low-priority notes:
  - Update `lastSeen` after dedup, using the latest value rather than the max. The official client reads relay f3 from the already-deduped stream [B@737226], [B@737471].
  - Confirm that an empty or unexpanded `GOOGLE_MESSAGES_PAGE_USER_AGENT` counts as unset.
- **Route 14, OBSERVED:**
  - The payload is relay f12 [B@1211140], [B@731886]. It is binary protobuf (`se` binary reader [B@798993], [B@39414]; `ve` is the JSPB reader [B@39757]) and in the clear, with no decrypt step.
  - The top-level message is a oneof over 1–9 [B@798710]: f4 = paired, f6 = empty, and the others are UNVERIFIED. If f4 is missing, pairing fails.
  - f4 = {f1 phone identity, f2 token {f1 bytes, f2 int64 TTL} [B@732417], f3 browser identity, f4 bytes (UNVERIFIED)}.
- **Client actions on f4:**
  - It disconnects the stream, installs the new token, and stores the browser and phone identities as serialized binary under `tachyon_auth_desktop_id` / `tachyon_auth_dest_id` [B@1205154], [B@1211455], [B@885202].
  - If the QR screen was abandoned (flag set at [B@1206955], meaning INFERRED), it installs the token, then revokes and fails the pairing. The connector should revoke when a route-14 event arrives after its link is dead.
- **Q-011 bonus:** `RevokeRelayPairing` f2 is the full browser identity message, sent with `fg` 3, and skipped when none is stored [B@1083891].
- **Still open:** the QR-mode `SendMessage` destination (Q-008), f4.4's meaning, a live QR pairing (needs the owner's phone; OPEN-QUESTIONS §18), and the BotGuard f39 presence check.
- **Docs:** SPEC v0.5 §4.1 steps 4 and 6 and §8 were updated on PR #18's branch.
