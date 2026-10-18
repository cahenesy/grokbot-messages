# Google Messages for Web Protocol: Clean-Room Behavioral Specification

Version 0.3 (handoff), 2026-10-18. Clean-room behavioral specification for the implementation team. v0.3 adds the spec-team answers to implementer questions Q-001–Q-011 (§0.5) and marks the corresponding gaps inline.

## 0. How to read this document

This document describes how the Google Messages for Web client behaves on the wire. It was written from Google's own web client (page HTML at `https://messages.google.com/web/authentication` and the JavaScript bundle module `mw_b` from `www.gstatic.com/_/messagesweb/...`, build `messagesweb.mw.en_US.4-84y6pqYJM.O`) plus live wire captures against that same official client. Supporting artifacts (bundle copies, capture summaries, provenance) are held by the spec team and are not part of this handoff package.

Citations of the form **[B@offset]** point to a byte offset in Google's `mw_b` JavaScript bundle. **[H:flag]** points to a configuration flag key in the page HTML.

Confidence labels:

- **OBSERVED** — visible in Google's shipped client code or config.
- **INFERRED** — a reasonable reading of minified code; treat as a hypothesis.
- **UNVERIFIED** — not established; needs a test (see `OPEN-QUESTIONS.md`).
- **VERIFIED-LIVE** — confirmed on the wire in a live capture of the official client.
- **CONTRADICTED** — an earlier claim disagreed with live traffic; the corrected statement follows.

Implementers should treat every field number as something to confirm against their own traffic once they pair.

## 0.1 Live verification (2026-10-18, Google-account pairing)

Live Google-account (emoji-match) pairing was analyzed with a schema-less protobuf/JSPB walker. No payloads were decrypted. Key outcomes:

1. Gaia mode uses host `instantmessaging-pa.clients6.google.com` with network string **`"GDitto"`**. The regional host `instantmessaging-pa-jms-us.clients6.google.com` is used for the RCS identity path (`ListIdentities`, `SignInSecondary`, `PullMessages`). **VERIFIED-LIVE.**
2. All observed Gaia RPCs use `Content-Type: application/json+protobuf` and `X-User-Agent: grpc-web-javascript/0.1`. Binary protobuf / `Pairing/*` were not used (expected for non-QR). **VERIFIED-LIVE.**
3. AuthMessage layout: f1=requestId (uuid), f3=network (`GDitto`/`RCS`), f6=token bytes (len 140 GDitto / 176 RCS), f7=ConfigVersion with Year/Month/Day/V1/V2 = 2026/10/15/4/6. **VERIFIED-LIVE.** The **subfield numbers inside f7 are UNVERIFIED** (Q-001). In JSPB, index *i* = field *i+1*, so confirm them from the positions in your own request bodies. Whether f7 is required on every call is UNVERIFIED.
4. SignInGaia is a two-step emoji flow: init (UKEY2-style blob type=3) → confirm (adds field 36) → response field 4 = `[token, TTL]`. TTL = 24 hours in microseconds. **VERIFIED-LIVE.**
5. Device identity wire shape is `[typeEnum, sourceId, network]` with typeEnum=`16` for the GDitto browser device (not a large user id). **CONTRADICTED** prior "int64 userID" reading; corrected in §4.
6. SendMessage carries destination device, a Message with type **19**, AuthMessage, optional deadline in microseconds (5 min or 24 h), and Message.field 12 = action envelope. **VERIFIED-LIVE.**
7. Action envelope fields 1=requestId, 2=actionType, 3=unencrypted body, 5=opaque body, 6=sessionId. Field 5 did **not** appear as the nested encrypted-container protobuf; it is an opaque blob (flat ciphertext hypothesis). **CONTRADICTED** for wire shape of field 5; algorithm claims from JS remain OBSERVED but unconfirmed against ciphertext.
8. Actions seen: 1, 16, 31, 37×10, 44, 45, 48×2, 52×2, 53. **VERIFIED-LIVE** counts.
9. AckMessages field 2 = repeated message-ID uuids. **VERIFIED-LIVE.**
10. ReceiveMessages response body was not captured by the HAR (streaming). Incoming event types remain **UNVERIFIED**.
11. No RegisterRefresh in a ~3 minute session (token TTL 24 h). Refresh timing remains **UNVERIFIED**.

## 0.2 Live verification (send one RCS message, 2026-10-18)

Live send of one short RCS text (42 characters) after pairing. Highlights:

1. **LookupRegistered** (jms-us, network `"RCS"`) runs when a number is entered; response status `1` plus Tachyon endpoints / caps `[4,5]` precedes the "RCS chat" path. **VERIFIED-LIVE.**
2. **Action 9** = get-or-create conversation (1×). **VERIFIED-LIVE** (purpose confirmed by sequence).
3. **Action 3** = send message (**exactly 1×**). Envelope: f1=reqId(36), f2=3, f5=opaque 295 B, f6=sessionId(36). Client message id = Message.f1 uuid. **VERIFIED-LIVE.**
4. Double outgoing bubble ≠ two Bugle sends. A separate RCS-plane SendMessage (type 36 on jms-us) also occurred; purpose UNVERIFIED. Self-echo remains the best explanation for the duplicate bubble.
5. Field 5 for action 3 is opaque 295 B for a 42-char body; flat CT‖IV‖HMAC ⇒ CT≈247 B (plausible framing). Nested container still not seen on the wire.

## 0.3 Live verification (typing, reaction attempt, media — 2026-10-18)

Live typing, attempted reaction on a pending message, and one PNG media send. Highlights:

1. **Action 22** fires while composing text (typing test). **VERIFIED-LIVE.** Subtype start/stop not separated in-capture.
2. Reaction (action 38) was not sent — UI blocked react on pending message. A console 401 was reported by the tester but was not present in the retained capture (possible stale cookie auth on a dropped request). `RotateCookies` occurred ~40 s later.
3. Media path is dual upload then action 3:
   - **Copper** (`rcs-copper-optimized-us.googleapis.com`): resumable upload of **plaintext** PNG (+ parallel 748 B optimized variant).
   - **Bugle** (`instantmessaging-pa.googleapis.com/upload`): resumable upload of **encrypted** bytes (1642→1672, leading `0x00`).
   - Send uses **action 3** with larger opaque f5 (333 B). Inner media-id/key fields still UNVERIFIED on the wire (encrypted).

## 0.4 Live verification (reaction — 2026-10-18)

Live reaction (thumbs-up) on a delivered outgoing RCS text.

1. **Action 38** is the Bugle reaction RPC. **VERIFIED-LIVE** (exactly one). Envelope: f1=reqId(36), f2=38, f5=opaque **72** B, f6=sessionId(36).
2. Companion RCS-plane SendMessage type **36** on jms-us followed (~0.8 s later), same pattern as after text send. **VERIFIED-LIVE** as a recurring companion; purpose still UNVERIFIED.
3. Follow-up AckMessages on both GDitto and RCS hosts. **VERIFIED-LIVE.**
4. f5≈72 B ≪ action-3 text/media (295/333) — consistent with referencing an existing message plus a small reaction code rather than carrying message body/media.

## 0.5 Answers to implementer questions Q-001–Q-011 (2026-10-18)

**Owner direction (binding):** Google-account (Gaia) pairing (§4.2) is the **primary** pairing path, per IMPLEMENTATION-PLAN Phase 1. QR phone-relay pairing (§4.1) is **secondary** and is allowed only if the QR is served out-of-band. The QR image or payload must never appear in MCP tool output or logs, because it contains the long-lived payload keys (§4.1 step 3, §5).

| Q | Topic | Status after review |
|---|---|---|
| Q-001 | ConfigVersion (AuthMessage f7) | Values 2026/10/15/4/6 **VERIFIED-LIVE** (GDitto/RCS). Subfield numbers **UNVERIFIED**. Required-on-every-call **UNVERIFIED**. Bugle value **UNVERIFIED** (INFERRED: tracks client build, not network). |
| Q-002 | RegisterPhoneRelay f4 SPKI field / QR expiry field | Both field numbers **UNVERIFIED** (no QR capture). P-256 SPKI DER is 91 bytes, prefix `30 59 30 13 06 07 2A 86 48 CE 3D 02 01` (standard DER) — use it to locate the field in your own capture. |
| Q-003 | QR-mode API key and headers | Key-to-mode mapping **UNVERIFIED**. Key attached at [B@1084238] / [B@973804]. `X-Goog-AuthUser` / `SAPISIDHASH` are Gaia-only (OBSERVED); not expected in QR mode (INFERRED). `Origin` enforcement **UNVERIFIED**. |
| Q-004 | ReceiveMessages element / route-14 container | Element `"1"` is probably JSPB (INFERRED from `format:"jspb"`); field paths, container encoding, encryption state and QR-mode request body **UNVERIFIED**. A spec-team QR capture is deprioritized (Gaia primary). |
| Q-005 | Browser details f5/f6, non-browser user agent | f5/f6 meaning and requiredness **UNVERIFIED**. No evidence for or against rejection of a non-browser UA. Honest UA with type 1 is acceptable to the spec team. |
| Q-006 | AI implementer (process) | **APPROVED** by the project owner, with controls (traceability of every constant, no constants from recall, spec-team constant review per phase, DEVLOG attestation). See issue #6. |
| Q-007 | Hosting / QR in chat (process) | Per-user single-tenant host acceptable under rule 6 (**APPROVED**). QR in tool output **not acceptable**. Gaia primary. See issue #7. |
| Q-008 | SendMessage / inbound encodings | Message.f12 likely base64 of a binary-protobuf envelope (INFERRED). Envelope f1/f6 are 36-byte values (UUID text form INFERRED). qN known only for 2 / 16 (action 1) / 20 (action 44). Deadline per action **UNVERIFIED** (INFERRED READ → 24 h). f9 meaning **UNVERIFIED**. Inbound field paths **UNVERIFIED**. |
| Q-009 | Plaintext action layouts | Only the JS-OBSERVED fields in §7 are known. Plaintext encoding INFERRED binary protobuf. All other field numbers **UNVERIFIED**. |
| Q-010 | Conversation / Message schemas | **UNVERIFIED** (no field-level schema). See OPEN-QUESTIONS §13. |
| Q-011 | QR lifecycle, keep-alive, activation | Activation 16 → 31 OBSERVED (seen once each live). Keep-alive **UNVERIFIED** (`M4QZzf` 10 s and action 48 INFERRED/UNVERIFIED). RevokeRelayPairing f2 shape **UNVERIFIED**. Phone-initiated unpair **UNVERIFIED**. |

## 1. Architecture

The browser never talks to the cellular network or to RCS servers. All three parties talk to Google's "Tachyon" instant-messaging relay, and the browser's real counterpart is the Messages app on the phone (OBSERVED: class and log names such as `TachyonClient`, `TachyonAuthProvider`, `BugleBackendService`, and `BugleQrAuthenticationService` appear throughout the bundle).

The topology is browser → HTTPS → relay (`instantmessaging-pa.*`) → push → phone, and the reverse for replies.

The browser wraps each application request (for example "list conversations") in a relay envelope that is addressed to the paired phone. The payload inside that envelope is encrypted with keys that only the browser and the phone hold (§5). The relay sees the routing metadata but not the payload (INFERRED from the envelope layout in §6).

Internally the client identifies two backend modes. In the client's own storage keys and tags, "B" (Bugle) is the QR/phone-relay mode and "BG" is the Google-account ("Gaia"/"Ditto") mode. OBSERVED: storage key prefixes `tachyon_auth_*` vs `bg_tachyon_*` [B@1011889], and the mode labels `"B"` and `"BG"` [B@885514].

## 2. Hosts and endpoints

Hosts come from page configuration flags (OBSERVED, [H]):

| Purpose | Value | Flag |
|---|---|---|
| Relay RPC base (QR/phone-relay mode) | `https://instantmessaging-pa.googleapis.com` | `solGAe` |
| Relay RPC base (Google-account mode, cookie-authenticated) | `https://instantmessaging-pa.clients6.google.com` | `tkZp9e` |
| Alternative regional relay | `https://instantmessaging-pa-jms-us.clients6.google.com` | `jWCg4c` — VERIFIED-LIVE used for RCS `ListIdentities`, `SignInSecondary`, `PullMessages`, and RCS `AckMessages` |
| Media upload | `https://instantmessaging-pa.googleapis.com/upload` | `Ie9LEf` |
| People/contacts API | `https://people-pa.clients6.google.com/` | `A24W3d` |
| Sticker API | `https://sticker-pa.googleapis.com` | `x5y9Oc` |
| Pairing help/QR base URL | `https://support.google.com/messages/?p=web_computer` | `cZrZ7c` (that this is the QR prefix is INFERRED, §4.1) |

Two public API keys (`AIza...`) are embedded in the page config, and a third is in the bundle. They are sent as `X-Goog-Api-Key` (OBSERVED [B@1084238], [B@973804]). Which key is used in QR mode is **UNVERIFIED** (Q-003). Inspect those offsets in the public bundle to see which config value is wired in. They are not reproduced here; the implementer should read them from the live page at runtime rather than hard-coding them.

All RPC paths have the form `<base>/$rpc/google.internal.communications.instantmessaging.v1.<Service>/<Method>` (OBSERVED [B@947353–972240], [B@1084459–1085631]).

| Service | Methods present in the client |
|---|---|
| `Pairing` | `RegisterPhoneRelay`, `RefreshPhoneRelay`, `RevokeRelayPairing`, `GetWebEncryptionKey` |
| `Messaging` | `SendMessage`, `ReceiveMessages` (server-streaming), `PullMessages`, `AckMessages`, `PrewarmReceiver`, `Echo` |
| `Registration` | `Register`, `RegisterRefresh`, `Unregister`, `SignInGaia`, `SignInSecondary`, `GetAccountInfo`, `LinkIdentity`, `ListIdentities`, `LookupRegistered`, `DeleteAccount`. **LookupRegistered VERIFIED-LIVE** on jms-us when a destination is entered (see §0.2). |
| `SmartMessaging` | `CreateConversation`, `GetContentDecoration` (these appear to belong to the RCS-account feature; their relevance to a connector is UNVERIFIED) |

## 3. Transport and encoding

**Framing.** The client uses Google's gRPC-Web JavaScript runtime. Every call is an HTTP `POST` with the header `X-User-Agent: grpc-web-javascript/0.1` (OBSERVED [B@966275]).

**Two encodings.** The client is built with one of two serializer formats per client object (OBSERVED):

- The `Pairing` client is built with `format:"binary"` and sends `Content-Type: application/x-protobuf` (standard protobuf binary) [B@1084707].
- The `Messaging` and `Registration` clients are built with `format:"jspb"` and send `Content-Type: application/json+protobuf` [B@966232], [B@967213], [B@971623].

The json+protobuf encoding is Google's positional JSON-array form of protobuf. A message is a JSON array in which index *i* holds field number *i+1*. Absent fields are `null`, nested messages are nested arrays, repeated fields are arrays, and bytes are base64 strings. 64-bit integers are commonly sent as decimal strings. This is general knowledge of Google's JSPB wire format; the exact rules for int64 and bytes on this service are UNVERIFIED.

**Response parsing.** The response decoder chooses its parser by the response `Content-Type` (OBSERVED [B@213924]):

- `application/json+protobuf` is parsed as positional JSON.
- `application/json` is parsed as plain JSON.
- `application/x-protobuf` is parsed as binary. If `Content-Transfer-Encoding: base64` is also present, the body is base64-wrapped binary. The client can ask for base64 with `X-Accept-Content-Transfer-Encoding: base64` [B@966232].

**Streaming.** `ReceiveMessages` is a long-lived streaming POST. The stream yields objects in which key `"1"` carries a serialized response message and key `"2"` carries a status/trailer (OBSERVED [B@948653]). Each element is decoded as one `ReceiveMessages` response. Because the `Messaging` client is `format:"jspb"`, element `"1"` is probably a JSPB array (INFERRED). The field path from an element to the route/type field and to the payload is **UNVERIFIED** (Q-004, Q-008). Browser HAR exports do not retain stream bodies, so capture them with the DevTools response view or a local proxy. The client also has a fallback mode that polls with `PullMessages`, controlled by `TACHYON_CLIENT_START/STOP_FALLBACK_TO_PULL_MESSAGES` and `PULL_MESSAGES_FALLBACK_OPTIONS` (OBSERVED identifiers).

**Prewarm.** Before the first `SendMessage`, the client sends a `HEAD` request to the `SendMessage` URL with its auth headers and `content-type: application/x-protobuf`, which appears to warm the CORS preflight and connection (OBSERVED [B@1080825]).

**Headers.** The client sends `X-Goog-Api-Key` on all relay calls. In Google-account mode it also sends cookie-based `Authorization: SAPISIDHASH …` with credentials. OBSERVED: the set `{"SAPISIDHASH","APISIDHASH"}` toggles `withCredentials` [B@948653], and `X-Goog-AuthUser` appears. How SAPISIDHASH is computed is standard Google web practice and is out of scope. `X-Goog-AuthUser` and `SAPISIDHASH` are Google-account-mode only; they are not expected in QR mode (INFERRED). Whether the server enforces `Origin`/`Referer` for non-browser clients is UNVERIFIED (Q-003).

## 4. Authentication, tokens, and pairing

### 4.1 QR (phone-relay) pairing: OBSERVED unless marked

1. **Key generation.** The browser generates an ECDSA P-256 key pair for request signing, using WebCrypto `generateKey({name:"ECDSA",namedCurve:"P-256"})` [B@171157]. It stores the pair as `crypto_pub_key`/`crypto_priv_key` [B@885514]. Separately, it generates a random 32-byte AES key and a random 32-byte HMAC key for payload encryption [B@1080825], where the HMAC key is generated and persisted.

2. **RegisterPhoneRelay** (binary protobuf). The request message contains the following fields [B@1086147 and the `vJ` method just after]:
   - Field 1: an auth header submessage. It holds a fresh request ID (a UUID string) and a network/product string, which is `"Bugle"` for QR / phone-relay mode (OBSERVED in JS). Google-account mode uses `"GDitto"` (VERIFIED-LIVE). The RCS identity path uses `"RCS"` (VERIFIED-LIVE).
   - Field 3: browser details. Its subfields are 1 = the `navigator.userAgent` string; 2 = a browser-type enum, observed mapping Opera→5, Edge/IE→7, Chrome→2, Firefox→3, Safari→4, IE-other→6, other→1 (INFERRED exact mapping); 3 = an OS name string (`"Windows"`, `"Mac"`, `"ChromeOS"`, `"Android"`, `"iOS"`, `"Linux"`, or empty); 5 = a boolean; 6 = a device-kind enum with values 1, 2, or 3. The meanings of f5/f6, and whether they are required, are **UNVERIFIED** (Q-005).
   - Field 4: key data. It wraps a submessage whose field 1 is set to `2` and which carries the ECDSA public key encoded as an X.509 SubjectPublicKeyInfo DER structure. The DER structure is built by hand with OIDs 1.2.840.10045.2.1 (EC public key) and 1.2.840.10045.3.1.7 (P-256), around the uncompressed point `0x04‖X‖Y` [B@193920] and [B@719018]. **The field number holding the SPKI bytes inside that submessage, and whether there is further nesting, are UNVERIFIED** (Q-002). A P-256 SPKI DER is exactly 91 bytes and begins `30 59 30 13 06 07 2A 86 48 CE 3D 02 01`.
   
   The response carries:
   - Field 3: the *pairing key*, an opaque byte string.
   - Field 5: a token submessage. Its field 1 is the bearer auth token bytes, and its field 2 is the time to live. The client converts the TTL with `/1000` into milliseconds, which implies the TTL is in microseconds (INFERRED).
   - A QR expiry duration, which the client converts the same way [B@1210378]. Its field number is **UNVERIFIED** (Q-002).

3. **QR payload.** The client builds a small protobuf with field 1 = the pairing key from step 2, field 2 = the AES key, and field 3 = the HMAC key. It base64-encodes this protobuf and displays the URL `<QR base URL>#?c=<base64>` as a QR code [B@1210378]. The base URL is a configured value; the flag `cZrZ7c` = `https://support.google.com/messages/?p=web_computer` is the likely value (INFERRED). Whether the base64 is standard or URL-safe is UNVERIFIED. **Security:** the AES and HMAC keys in this payload are the long-lived payload keys for the whole session (§5). Treat the QR image and URL as secrets: show them only out-of-band, never in tool output, chat transcripts, or logs (Q-007).

4. **Waiting for the phone.** Before or while the QR is shown, the browser opens a `ReceiveMessages` stream using the token from step 2. When the phone scans the code, the browser receives an incoming message whose route/type field (field 2) equals **14**. That message's payload decodes to a container whose field 4 is the "paired" data, with these subfields [B@1210378]:
   - 1 = the phone's device identity, which the client stores as `tachyon_auth_dest_id`.
   - 2 = a new token submessage, with field 1 = token and field 2 = TTL.
   - 3 = the browser's own device identity, which the client stores as `tachyon_auth_desktop_id`.

   Whether the route-14 payload is binary or JSPB, whether it is encrypted at this point, and the QR-mode `ReceiveMessages` request body beyond the AuthMessage are all **UNVERIFIED** (Q-004). In QR mode, the phone identity from f4.1 is INFERRED to be the `SendMessage` f1 destination; send it exactly as received (Q-008).
   
   A device identity is a small message with three fields: (1) a type / registration enum (VERIFIED-LIVE value `16` for the GDitto browser device; other values such as `1` appear for RCS identities), (2) a string source ID (VERIFIED-LIVE length 19 in live captures), and (3) a string network (`"GDitto"`, `"RCS"`, or `"Bugle"`). The earlier reading of field 1 as a large int64 user ID is CONTRADICTED by the live capture.

5. **QR refresh.** If the QR code expires before it is scanned, the client calls `RefreshPhoneRelay`. The call is authenticated with the token from step 2, and its response field 2 holds a new pairing key, from which a new QR code is built [B@1210378].

6. **Revocation.** `RevokeRelayPairing` takes field 2 = the browser device identity (source ID). It is sent on sign-out [B@1084238]. Whether f2 is the full identity message or only the source-ID string is UNVERIFIED. That f1 is the auth header is INFERRED from §4.3 (Q-011).

### 4.2 Google-account ("Gaia"/"Ditto") pairing: partly OBSERVED

The client also supports pairing through the user's signed-in Google account. In this mode, requests go to the `clients6` host with cookies, using `SignInGaia` and related calls. The phone and browser then run a **UKEY2** handshake. The cryptography below is OBSERVED [B@193920–195512]:

- The browser generates an ephemeral ECDH P-256 key pair.
- The client-init message commits to the browser's public key. The commitment is a SHA-512 hash of the serialized client-finish message, carried in a submessage tagged with cipher value **100**, which is the P-256/SHA-512 identifier in the UKEY2 protocol. The protocol version field is checked to equal **1**.
- From the server-init message, the client reads the server's public key as a protobuf with X and Y coordinates. It strips a single leading zero from any 33-byte coordinate and left-pads coordinates to 32 bytes. It also checks that the server's 32-byte random value is present and that the cipher equals 100.
- The ECDH shared secret is 256 bits from `deriveBits`, and the client hashes it with SHA-256.
- Key derivation uses HKDF-SHA256 throughout, with outputs of 32 bytes:
  - auth string = HKDF(secret, salt `"UKEY2 v1 auth"`, info = client_init‖server_init)
  - next secret = HKDF(secret, salt `"UKEY2 v1 next"`, info = the same)
  - client key = HKDF(next, salt = *D2D salt*, info `"client"`)
  - server key = HKDF(next, salt = *D2D salt*, info `"server"`)
  
  The *D2D salt* is a fixed 32-byte constant embedded in Google's client [B@782160]. It is the standard UKEY2/D2D salt published in Google's open-source UKEY2 library (Apache-2.0); the implementer should take it from that public source.
- **Ditto key step** (`DERIVE_GAIA_PAIRING_REV1_KEYS`) [B@1099375]. The client orders the client key and server key by a 31-multiplier hash of their bytes. It concatenates the D2D salt with the two keys in that order and takes SHA-256 of the result. From that digest it derives the payload AES key = HKDF(digest, salt `"Ditto salt 1"`, info `"Ditto info 1"`) and the payload HMAC key = HKDF(digest, salt `"Ditto salt 2"`, info `"Ditto info 2"`). These two keys play the same role as the QR-mode AES and HMAC keys.
- SignInGaia wire sequence (VERIFIED-LIVE from HAR):

1. Init request: AuthMessage without token; field 2 = `[[3, bytes≈33]]` (type enum 3 = UKEY2-style client-init); field 3 = `1`; field 4 = `"GDitto"`.
2. Init response: field 3 carries browser device identity, emoji-candidate list, and pairing metadata. No token yet.
3. Confirm request: same field-2 init blob plus field 36 = bytes (confirmation / selected emoji material, b64 length 48 in the capture).
4. Confirm response: field 2 = bytes (b64 length 48); field 4 = `[token bytes, TTL]`. TTL was 24 hours expressed in microseconds.

`CANCEL_GAIA_PAIRING` remains UNVERIFIED. The exact mapping from UKEY2 handshake messages onto SignInGaia field 2 subfields beyond type=3 is still partly UNVERIFIED.

### 4.3 Auth token lifecycle: OBSERVED [B@728600–730173], [B@719172]

- Every relay request embeds an auth header submessage in field 1 of the RPC request. The header holds a request ID, the network string, and the bearer token bytes.
- The token is renewed with `Registration/RegisterRefresh` when the token is 90% of the way to expiry. A pre-call check also refreshes once 95% of the lifetime has elapsed (OBSERVED in JS). Not exercised in live captures (session ≪ 24 h Gaia token TTL). Gaia tokens arrive from SignInGaia with TTL **24 hours** in microseconds (VERIFIED-LIVE).
- RegisterRefresh request fields:
  - 1 = auth header.
  - 2 = the current browser device identity.
  - 3 = the current time in **microseconds** (`Date.now()*1000`).
  - 4 = an ECDSA P-256/SHA-256 signature over the UTF-8 bytes of `"<requestId>:<timestamp>"` [B@719172].
  - 13 = a nested options submessage. Its field 23 can carry a push/FCM registration (field 1 = token, field 2 = sender) under sub-field 100.
- RegisterRefresh response: field 2 is a token submessage (1 = token, 2 = TTL). Field 8 is a UTF-8 string that the client keeps. If field 3 is true, the server rejected the timestamp, and the client retries once using the server's time from field 4 [B@729235].
- The signature encoding (raw r‖s from WebCrypto versus DER) is UNVERIFIED. WebCrypto natively produces raw 64-byte r‖s, and the bundle includes a DER-conversion helper nearby [B@171157].
- Retries use exponential backoff with base 2 and an initial delay of 1000 ms.
- In QR mode, RegisterRefresh is INFERRED to go to the QR relay base (`solGAe`) with network `"Bugle"` and the current token in AuthMessage f6. Not seen live in either mode (Q-011).
- Persistence keys include `tachyon_auth_token`, `tachyon_auth_token_expiration_time`, `tachyon_auth_token_received_at`, `tachyon_registration_id`, `fcm_token`, `fcm_sender_id`, `bugle_version`, and `bugle_flags` [B@885514].
- Page config contains `eO0ahb` = 1209600000 ms, which is **14 days**. This matches the publicly known inactivity unpair period (INFERRED meaning). The page config also contains `b9IVuf` = 604800000 ms (7 days), `y9sSNe`/`Q50b0` = 172800000 ms (2 days), and others whose meanings are UNVERIFIED.

## 5. Payload encryption between browser and phone: OBSERVED [B@848151–850900]

Application payloads are wrapped in a small "encrypted container" protobuf:

| Field | Meaning |
|---|---|
| 1 | Scheme: `2` = AES-CTR + HMAC-SHA256 (default); `1` = AES-128-GCM |
| 2 | IV/nonce |
| 3 | Ciphertext |
| 4 | HMAC tag (scheme 2 only) |

- **Scheme 2 (the default when encrypting).** The client generates a random 16-byte counter block. It encrypts the payload with AES-CTR using the 32-byte AES key (AES-256). It then computes HMAC-SHA256 with the HMAC key over **ciphertext ‖ IV**, in that order, and keeps the full 32-byte tag. Decryption checks that the IV is 16 bytes and compares the tag in constant time before it decrypts [B@848979].
- **Scheme 1.** This is AES-GCM with a 12-byte random nonce and a 128-bit tag, keyed with the **first 16 bytes** of the AES key (JWK `alg:"A128GCM"`). The client accepts scheme 1 on input when WebCrypto is available [B@848398].
- Live capture note (VERIFIED-LIVE / CONTRADICTED): action-envelope field 5 on the wire was an opaque blob (lengths 51–55 bytes for small requests) that did **not** parse as the nested `{scheme, iv, ciphertext, hmac}` protobuf. That favors a flattened ciphertext layout on the wire, with the nested container existing only inside the JS crypto helper. Algorithms above remain OBSERVED in JS and are still unverified against a known-plaintext encrypt/decrypt test. Unencrypted actions (44, 45, 48) place clear protobuf in field 3 instead.

## 6. Request and response envelope

### 6.1 Outbound to the phone (`Messaging/SendMessage`), OBSERVED [B@1048322], [B@367611], [B@948653]

Each phone-bound action is built in three layers.

**(a) Inner action envelope.** This is built for every action call:

| Field | Meaning |
|---|---|
| 1 | Request ID (a UUID string; the client reuses it to match the response) |
| 2 | Action type (an integer from §7) |
| 3 | Unencrypted payload bytes (used only for actions sent "unencrypted"; see §7). Otherwise it is set to an empty string. |
| 5 | Opaque / encrypted action-request bytes (VERIFIED-LIVE present for actions 1, 16, 37, 52). Wire shape is an opaque blob, not the nested container protobuf — see §5. |
| 6 | Session ID, bytes len=36 (uuid). VERIFIED-LIVE present once the browser session is active. |

**(b) Relay `SendMessage` request (VERIFIED-LIVE).** JSPB fields:
- Field 1 = destination device identity.
- Field 2 = Message: f1=messageId (uuid), f2=message type (**19** for all phone-bound RPCs in the capture), f12=serialized action envelope, f23=`[null, qN]` where qN is a small int hint (2 common; 16 with action 1; 20 with action 44).
- Field 3 = AuthMessage.
- Field 5 = optional deadline in microseconds (observed 300000000 = 5 min, 86400000000 = 24 h).
- Field 9 = optional `[bytes len=36]`. Meaning and when it is present are UNVERIFIED (Q-008).

Encoding notes (Q-008): the capture walker reported f12 as protobuf fields with byte lengths, which fits a **base64 string of a binary-protobuf envelope** inside the JSPB (INFERRED). Envelope f1/f6 are 36-byte values (UUID text form INFERRED). qN values recorded: 2 (most), 16 (action 1), 20 (action 44); any other qN is UNVERIFIED. Deadline per action is UNVERIFIED. As a working rule, READ → 24 h (`864E5` accompanies most READs in JS) and WRITE → 5 min (INFERRED).

The HTTP response is only a small relay ack (`[[null, digits], digits]`), not the action result. Action results arrive on `ReceiveMessages` (stream body was not retained in browser HAR exports).

**(c)** The request is sent with `Content-Type: application/json+protobuf`.

### 6.2 Responses from the phone

Responses do not come back on the `SendMessage` HTTP response. They arrive asynchronously on the `ReceiveMessages` stream and are matched to requests by request ID (INFERRED from the request-ID bookkeeping in `_.QI` [B@1048322]). In a decoded response envelope:

- Field 5 holds the (encrypted) response payload, which the client decrypts and parses with the action's response type.
- Field 9, when true, means **"session preempted"**: another browser tab or client has become the active session. The client then goes inactive with reason `INACTIVE_PREEMPTED_RPC`.
- The field path from a stream element to this envelope, and to the relay message ID used in `AckMessages`, is **UNVERIFIED**. The ack ID is INFERRED to be the inbound relay Message.f1 UUID, mirroring outbound. Whether the inbound Message type is 19 is UNVERIFIED (Q-008).

## 7. Action catalog

Action numbers are OBSERVED as the `Gc:` value passed to the client's action dispatcher, together with the READ/WRITE/ACK class it records (`Cd`). Purposes are INFERRED from the surrounding code (argument names, return shapes, and log strings) unless marked otherwise. A `864E5` (24 h) value accompanies most READs and appears to be a timeout or cache lifetime (INFERRED). **Live capture counts** (action envelope field 2): pairing HAR — 37×10, 48×2, 52×2, 1×1, 16×1, 31×1, 44×1, 45×1, 53×1; send HAR — 37×8, 49×3, 29×2, and 1× each of 22, 6, 28, **9**, 21, **2**, 32, **3**; typing/media HAR — **22**×2, **3**×1 (media); reaction HAR — **38**×1, **22**×1. Purposes remain INFERRED unless marked VERIFIED-LIVE.

| Action | Class | Inferred purpose (evidence) |
|---|---|---|
| 1 | READ | **List conversations.** The request carries a count, a folder/status filter, and an optional cursor; the response field 2 is a repeated conversation list and field 5 is a continuation cursor [B@~1050800, `tN`]. |
| 2 | READ | **List messages in a conversation.** The request carries the conversation ID, a cursor, and a count; the response field 2 is a repeated message list and field 5 is a cursor. It throws "Conversation not found" when the list is empty. **VERIFIED-LIVE** (1× right after action 9 when opening the new thread). |
| 3 | WRITE | **Send message.** JS: request has field 2 = conversation ID, field 5 = a client temporary message ID, optional field 4 = SIM/sender, optional boolean field 6, and the message content; response field 2 = message ID and field 3 = status [B@1063354]. **VERIFIED-LIVE:** exactly one action-3 in the send capture; action envelope f1=reqId(36), f2=3, f5=opaque 295 B (42-char plaintext), f6=sessionId(36); outer Message.f1 = client message uuid; Message type 19. Inner plaintext field layout of f5 remains opaque (encrypted). |
| 6 | READ | **List or search contacts** (limit, query, paging). Response field 2 = contacts, field 3 = cursor. |
| 9 | WRITE | **Get or create a conversation** from a list of destinations (E.164 / address identities); it optionally creates an RCS group and accepts a group name in field 3 (`createConversation`). **VERIFIED-LIVE** as the get-or-create step after LookupRegistered (1× in send capture; f5 opaque len=86). |
| 10 | WRITE | Takes field 2 = conversation ID and field 3 = a message ID; there is no response type. Likely **mark read up to message** (UNVERIFIED). |
| 12 | READ | Per-conversation boolean setting (field 3) with an optional SIM payload. Possibly **notifications/mute** (UNVERIFIED). |
| 13 | WRITE | **Update settings.** It carries many boolean and enum preference fields and returns the settings blocks. |
| 15 | WRITE | **Update conversation status.** Field 3 = conversation ID and field 2 = a status code. The unarchive path uses 3, and an archive/delete-style pair uses 5/6 (UNVERIFIED which is which). |
| 16 | READ | **Activate session / get updates.** It is sent with request ID = the new session ID and carries a timestamp. It is issued together with action 31 when the browser becomes active [B@1053783]. |
| 17 | ACK | **Acknowledge.** It sends an empty request, after the client processes message updates [B@1053193]. |
| 19 | WRITE | Takes the conversation ID (field 2) and optional SIM (field 3); returns success in field 2. Possibly **delete conversation** (UNVERIFIED). |
| 20 | WRITE | Per-destination write with field 2 = conversation, field 4 = destination, field 6 = boolean, field 5 = SIM. Possibly **block/report** (UNVERIFIED). |
| 21 | READ | **Get conversation type or metadata** by conversation ID. |
| 22 | WRITE | Session activity notifications, sent only while ACTIVE. Two variants carry subtype 1 and subtype 2 (+ a boolean). **VERIFIED-LIVE as compose/typing-related:** emitted during a typing test (f5 opaque 50 B). Distinct start vs stop not confirmed in live captures. |
| 23 | WRITE | Requires a capability flag; takes a conversation ID. Possibly **leave group** (UNVERIFIED). |
| 25 | WRITE | Takes a message ID, two booleans, and a conversation ID. Possibly **message flags** (UNVERIFIED). |
| 26 | READ | Per-destination capability check returning two booleans. Possibly **RCS reachability / is-blocked** (UNVERIFIED). |
| 27 | READ | Takes a message ID. Possibly **resend / download message** (UNVERIFIED). |
| 28 | READ | **Top contacts** (limit). |
| 29 | READ | **Participant thumbnails** (repeated ID→image). |
| 31 | READ | **Get capabilities** (a boolean that gates send, create-conversation, and group features). |
| 32 | READ | Returns a "market config" block. |
| 33 | READ | Returns a single value (purpose UNVERIFIED). |
| 36 | READ | Takes a message ID and a part ID. Likely **fetch full-resolution media part** (UNVERIFIED). |
| 37 | READ | **Contact thumbnails.** |
| 38 | WRITE | **Send reaction.** JS: field 1 = message ID, field 2 = emoji payload, field 3 = add/remove/switch enum, optional field 4 = SIM [B@1067788]. **VERIFIED-LIVE:** exactly one action-38 for a reaction on a delivered message; envelope f5 opaque 72 B (≪ action-3). Inner plaintext field layout still UNVERIFIED (encrypted). |
| 43 | READ | **Get one conversation** by ID. |
| 44, 45, 47 | WRITE (unencrypted) | Google-account/multi-device control messages, sent with `sendUnencrypted` and explicit registration-ID targets. Purpose UNVERIFIED. |
| 46 | READ | Takes an ID string; returns success. |
| 48 | READ (unencrypted) | An empty request to explicit targets. Possibly a ping (UNVERIFIED). |
| 49 | READ | **Search conversations** by query and participants. |
| 50 | WRITE | Returns a results list (purpose UNVERIFIED). |
| 52, 53, 56 | READ | Contact list variants: 52 is filtered, 53 is a full list, and 56 is cursor-paged. |
| 54 | WRITE | Requires a feature flag; takes a conversation and content. Likely **edit message** (UNVERIFIED). |

**Plaintext layouts (Q-009, Q-010).** Only the fields listed above are known, and they are OBSERVED in JS, not verified on the wire, because f5 is encrypted. The plaintext inside f5 is INFERRED to be binary protobuf (unencrypted actions carry clear protobuf in envelope f3). Not recorded, and so UNVERIFIED:
- the request field numbers for action 1 (count, folder filter and its enum values, cursor), action 2 (conversation ID, cursor, count), and action 9 (destination list);
- the timestamp field and units for action 16, and the capability field for action 31;
- the message-content field and the response status enum values for action 3;
- any Conversation or Message object schema.

Action 17's request is empty (OBSERVED JS; not seen live).

Text send (action 3) and get-or-create conversation (action 9) are VERIFIED-LIVE. Media sending, mark-read, typing, and delete-message are not yet mapped with confidence. See open questions. A parallel RCS-plane SendMessage with message type 36 on jms-us follows Bugle action 3 (text) and action 38 (reaction); role still UNVERIFIED but recurrence is VERIFIED-LIVE. Media send uses action 3 after Copper+Bugle uploads (§9).

## 8. Incoming event stream and acknowledgements

- The browser keeps one `ReceiveMessages` stream open at a time. Inbound items carry a route or type number. **14** is the pairing event (OBSERVED). Other numbers, such as data events and heartbeats, are UNVERIFIED.
- When the browser becomes the active client, it picks a new session ID (a UUID), stores it, sends action 16 with that ID as the request ID, and requests capabilities with action 31 [B@1053783]. If a previous session ID exists, the client may resume it. Each of 16 and 31 was seen once in the live pairing capture. Whether other actions go unanswered without 16 → 31 is UNVERIFIED, so send them first (Q-011).
- Data updates pushed by the phone, such as new or updated conversations and messages, arrive as encrypted payloads on the stream. Client identifiers `CONVERSATION_UPDATE`, `MESSAGE_UPDATE`, `NEW_RCS_MESSAGE_EVENTS`, and `RCS_MESSAGE_STATUS_UPDATE_EVENTS` exist (OBSERVED names), but their wire mapping is UNVERIFIED.
- The client acknowledges processed relay messages with `Messaging/AckMessages` (VERIFIED-LIVE): request = `[AuthMessage, repeated messageId uuid strings]` (1–6 IDs per call observed); response = `[[null, digits]]`. Action 17 (application-level ack) was not observed in live captures and remains OBSERVED-from-JS only [B@1053193].
- Page config contains `M4QZzf` = 10000 ms. A 10-second interval matches a heartbeat or ping cadence (INFERRED). Action 48 (unencrypted, empty, to explicit targets; seen twice live in the pairing capture) is possibly a ping (UNVERIFIED). How long the server keeps a stream open is UNVERIFIED (Q-011).
- The inactivity and unfocused-tab states are named `BROWSER_ACTIVE`, `BROWSER_INACTIVE_FROM_TIMEOUT`, and `INACTIVE_LACK_OF_ACTIVITY` (OBSERVED).

## 9. Media

### 9.1 Hosts

- Bugle/GDitto upload: `https://instantmessaging-pa.googleapis.com/upload` (OBSERVED [H:Ie9LEf], **VERIFIED-LIVE**).
- RCS Copper optimized upload: `https://rcs-copper-optimized-us.googleapis.com/` (**VERIFIED-LIVE**; not in the original page-flag table — discoverable at runtime). Used for plaintext RCS media + an optimized derivative.
- Downloads: "download media" path (`FETCH_MEDIA`, `DOWNLOAD_MEDIA`) with a URL fetch [B@977200] — still lightly verified.

### 9.2 Resumable upload protocol (VERIFIED-LIVE)

Both Copper and Bugle use Google’s `x-goog-upload-*` resumable protocol:

1. **start** — headers: `x-goog-upload-protocol: resumable`, `x-goog-upload-command: start`, `x-goog-upload-header-content-type`, `x-goog-upload-header-content-length`. Body is a small protobuf carrying an AuthMessage-like blob (network `"RCS"` on Copper, `"GDitto"` on Bugle) plus a client uuid. Response returns `x-goog-upload-url` / `control-url` including `upload_id`, `x-goog-upload-status: active`, and chunk granularity (Copper 1048576; Bugle 262144).
2. **upload, finalize** — headers: `x-goog-upload-command: upload, finalize`, `x-goog-upload-offset: 0`, same content-type/length. Single chunk for a 1642-byte PNG. Response `x-goog-upload-status: final` plus a small protobuf handle (Copper: handle bytes len=135, size, variant; Bugle: nested descriptor with a string handle len=57).

### 9.3 Encryption of uploaded bytes (VERIFIED-LIVE)

- **Copper:** declared size equals the source PNG (1642) or a smaller optimized variant (748). Body is image-like (low entropy ≈4.6; PNG structure). **Not encrypted.**
- **Bugle:** declared size **1672** = 1642 + 30. Body does not start with PNG magic (leading `0x00`). **Transformed / encrypted** before upload. +30 bytes matches a compact AES-GCM envelope (header + 12-byte nonce + 16-byte tag), consistent with JS OBSERVED AES-GCM media crypto [B@218067]. Full chunk framing for large files remains UNVERIFIED.

### 9.4 Sending media as a message

- Media send uses the same Bugle **action 3** as text (**VERIFIED-LIVE**). Opaque f5 was 333 bytes for a no-caption PNG vs 295 for a 42-char text (+38).
- How the message points at the upload (media id, decryption key material) is inside encrypted f5. JS OBSERVED: a per-upload key is carried in a media-content protobuf for the recipient. Live field numbers/lengths for that inner struct are **UNVERIFIED** without a known-plaintext decrypt test.
- The client compresses/resizes images when needed [B@974566] and maps MIME types to a content-type enum [B@218067].

## 10. Session refresh, expiry, and unpair

- Token refresh is described in §4.3.
- Unpair from the browser uses `RevokeRelayPairing` (QR mode) or `Registration/Unregister` (account mode) (OBSERVED methods; the usage mapping is INFERRED).
- An unpair initiated by the phone is UNVERIFIED. The container that carries the pairing event appears to have an alternative branch for revocation; this is INFERRED from the `field 4` "paired" access implying sibling variants.
- The client limits itself to one active browser session per pairing; see "session preempted" in §6.2.

## 11. Error handling

- Relay errors are gRPC status codes. The client treats codes 1, 2, 4, 10, 13, and 14 (CANCELLED, UNKNOWN, DEADLINE_EXCEEDED, ABORTED, INTERNAL, UNAVAILABLE) as retryable [B@173029].
- A rejected refresh timestamp triggers a single retry using the server clock (§4.3).
- Failure statuses on sends and reactions are small enums in the response (§7).

## 12. Glossary

- **Bugle**: Google's internal name for the Messages app and its protocol family. It is used as the network string in QR mode.
- **Ditto**: the internal name for the web/companion client feature.
- **Tachyon**: Google's instant-messaging relay and registration backend (the `instantmessaging-pa` hosts).
- **Gaia**: Google account identity. "Gaia pairing" means pairing through the signed-in account rather than a QR code.
- **Pairing key**: an opaque value returned by RegisterPhoneRelay and carried in the QR code.
- **Session ID**: a UUID marking which browser tab is the active client.
- **Action type**: an integer that selects the application operation inside the encrypted envelope.
- **UKEY2**: Google's authenticated key-agreement protocol, which is open source under Apache-2.0.
- **JSPB / json+protobuf**: protobuf serialized as positional JSON arrays.

## 13. Sources (safe for implementers)

1. Google Messages for Web: `https://messages.google.com/web/authentication` and its JavaScript bundles under `https://www.gstatic.com/_/messagesweb/`.
2. Google, "Messages End-to-End Encryption Overview" v1.2 (phone-side RCS E2EE background; does not define the browser wire protocol): `https://www.gstatic.com/messages/papers/messages_e2ee.pdf`.
3. qutebrowser issue #4426 (public corroboration of the RegisterPhoneRelay URL and CORS headers): `https://github.com/qutebrowser/qutebrowser/issues/4426`.
4. Google's open-source UKEY2 library (Apache-2.0) for UKEY2 protocol facts and the D2D salt.
5. Live wire captures of the official web client (2026-10-18), analyzed by the spec team. Raw captures are held by the spec team and are not part of this package.

## 14. Provenance note

This specification was produced by a separate spec team under clean-room rules. Protocol facts are cited to Google's own client or to the public sources above. Detailed provenance records and supporting artifacts are held by the spec team — ask them in writing via `QUESTIONS.md` if you need clarification; do not seek out excluded implementations.
