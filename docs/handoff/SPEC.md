# Google Messages for Web Protocol: Clean-Room Behavioral Specification

Version 0.5 (handoff), 2026-10-18. Clean-room behavioral specification for the implementation team. v0.3 added the spec-team answers to implementer questions Q-001–Q-011 (§0.5). v0.4 added the Google web session header construction (A-012, §3), the single-use pairing page direction (revised A-012, §4.1), and the SignInGaia structure and BotGuard findings (A-013 part 1, §4.2). v0.5 adds the page-config layout (A-003 follow-up, §2), the Google-account pairing rounds, HKDF table, rev1 ordering, destination choice and DeviceId correction (A-013 part 2, §4.2), the verification emoji (A-015, §4.2.3 and `EMOJI-TABLES.md`), corrections to the `SendMessage` destination and the inbound envelope (A-015, §6), the page-fetch `User-Agent` rule (A-003 part 3, §2), the `ReceiveMessages` response structure (A-016, §3, §6.2, §8), the QR route-14 payload and `RevokeRelayPairing` f2 (A-017, §4.1), the flat wire layout of encrypted payloads and binary plaintext (A-018, §5), the request/response layouts of actions 16, 31, 1 and 2 (A-018, §7.1), the Conversation, Participant, Message and part layouts (A-019, §7.2), and the push-update mapping, including the action-17 trigger (A-019, §8).

## 0. How to read this document

This document describes how the Google Messages for Web client behaves on the wire. It was written from Google's own web client (page HTML at `https://messages.google.com/web/authentication` and the JavaScript bundle module `mw_b` from `www.gstatic.com/_/messagesweb/...`, build `messagesweb.mw.en_US.4-84y6pqYJM.O`) plus live wire captures against that same official client. Supporting artifacts (bundle copies, capture summaries, provenance) are held by the spec team and are not part of this handoff package.

Citations of the form **[B@offset]** point to a byte offset in Google's `mw_b` JavaScript bundle. **[P@offset]** points into the lazily loaded pair-page module `MqwFTd` and **[F@offset]** into the root-routes module `fZRov`, both fetched from `www.gstatic.com` for the same build (load URL form: the `mw_b` URL with `exm=<loaded modules>/ed=1` added and `m=<module>`). **[H:flag]** points to a configuration flag key in the page HTML.

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

**Page-config container (A-003 follow-up, OBSERVED).** The page has an inline script that sets `window.MW_CONFIG = '<string>'` [B@806731]. The value is a single-quoted JS string literal: `[`, `]` and `"` appear as `\x5b`, `\x5d` and `\x22`, `/` as `\/`, and non-ASCII characters appear raw. Once unescaped, it is valid JSON: a JSPB array of 12 elements.

- `[0]` = a build date string and `[1]` = the build label.
- `[2]` = flags, as `[name, int]` pairs.
- `[3][0]` = consts, as `[name, valueMsg]` pairs. `valueMsg` is `[null, <int>]` or `[null, null, "<string>"]`, which the bundle reads as a oneof (2 = int, 3 = string) [B@809787].
- The relay key const `A16fYe` is a string const. Look it up **by name**, because positions are INFERRED to change between builds.
- The client re-fetches the same config from `<app base>/config?buildLabel=<label>` every 15 minutes, stripping a `)]}'` prefix [B@805721]. Whether that works without cookies is UNVERIFIED.
- Never log const values. The official client logs `Setting const <name> to <value>` [B@808932]; don't copy that.

**Page fetch `User-Agent` (A-003 part 3, VERIFIED-LIVE 2026-10-18).** An unauthenticated `GET https://messages.google.com/web/authentication` returns **HTTP 400** unless the `User-Agent` is a full, current, mainstream desktop browser string. Current desktop Chrome and Firefox UAs got 200 with `MW_CONFIG` and `A16fYe` present. Every non-browser or partial string tried got 400, including the connector's own name, `Mozilla/5.0 (compatible; …)`, and a bare `Chrome/<version>` token. `Accept` and `Accept-Language` made no difference. A very old Chrome UA (major version 60) got **200 without `MW_CONFIG`** (INFERRED: an unsupported-browser page).
- **Spec-team ruling (owner-delegated):** for this public, unauthenticated page and config fetch only, the connector may send one fixed, current desktop browser `User-Agent` string. Keep it in a single constant that cites A-003 part 3, and allow an optional override setting for self-hosters.
- Treat "200 without `MW_CONFIG`" as a failure, the same as a 400. Fail with a clear error that names the likely cause (an outdated pinned UA), and never retry in a loop.
- `${GOOGLE_MESSAGES_API_KEY}` is an optional override, not a required setting.
- Relay calls keep `X-User-Agent: grpc-web-javascript/0.1` (OBSERVED) and the runtime's default HTTP `User-Agent`, unless a live test shows a refusal tied to the UA (OPEN-QUESTIONS §21).
- **Owner review item:** this is a product/ToS-risk item. It goes on the pre-listing owner review next to the "undocumented API" notice (§4.2).

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

**Streaming.** `ReceiveMessages` is a long-lived streaming POST. The stream yields objects in which key `"1"` carries a serialized response message and key `"2"` carries a status/trailer (OBSERVED [B@948653]). Each element's `"1"` is deserialized as one `ReceiveMessages` **response** (not as a relay message) [B@732839], with JSPB as the format (the `Messaging` client is `format:"jspb"`). Its layout is in §6.2 (A-016). Browser HAR exports do not retain stream bodies, so capture them with the DevTools response view or a local proxy. The client also has a fallback mode that polls with `PullMessages`, controlled by `TACHYON_CLIENT_START/STOP_FALLBACK_TO_PULL_MESSAGES` and `PULL_MESSAGES_FALLBACK_OPTIONS` (OBSERVED identifiers).

**Prewarm.** Before the first `SendMessage`, the client sends a `HEAD` request to the `SendMessage` URL with its auth headers and `content-type: application/x-protobuf`, which appears to warm the CORS preflight and connection (OBSERVED [B@1080825]).

**Headers.** The client sends `X-Goog-Api-Key` on all relay calls, and `X-User-Agent: grpc-web-javascript/0.1` on every request (OBSERVED). QR mode is not expected to send `X-Goog-AuthUser` or `SAPISIDHASH` (INFERRED). Whether the server enforces `Origin`/`Referer` for non-browser clients is UNVERIFIED (Q-003).

**Google web session headers (Google-account mode; A-012, from `mw_b.js`):**

- **Cookie sources (OBSERVED [B@311997–312100], [B@312700]):** `SAPISID` (falling back to `APISID`, then `__Secure-3PAPISID`), plus `__Secure-1PAPISID` and `__Secure-3PAPISID` for the first-party and third-party variants.
- **`Authorization` (OBSERVED [B@312700–313300]):** on an `https:` page, a space-separated list of up to three items: `SAPISIDHASH <v>` (from `SAPISID`), `SAPISID1PHASH <v>` (from `__Secure-1PAPISID`), `SAPISID3PHASH <v>` (from `__Secure-3PAPISID`). On a non-https page the client uses `APISID` with the `APISIDHASH` scheme.
- **Hash (OBSERVED [B@298938]; SHA-1 confirmed by its five standard initial-state constants [B@40664]):** lowercase hex SHA-1 over space-joined parts.
  - Timestamped branch: parts = `<unix seconds> <cookie value> <origin>`, value = `<unix seconds>_<hex digest>`. If extra key/value pairs are supplied, their values are joined with `:` and put in front, and their keys are joined and appended after another `_`.
  - Untimestamped branch: parts = `<cookie value> <origin>`, value = `<hex digest>`.
  - Which branch the relay calls use is **UNVERIFIED** (OPEN-QUESTIONS §17).
- **Origin string (OBSERVED [B@298200]):** derived from the page URL. It is lowercased, the path, query and fragment are stripped, and the port is kept only if it isn't the default (80 for http, 443 for https). For the official client that is `https://messages.google.com` (INFERRED; not seen in a capture).
- **`withCredentials` (OBSERVED [B@948653], [B@966344]):** cookies are sent when the `Authorization` scheme is `SAPISIDHASH` or `APISIDHASH`, or when the RPC client was built with credentials.
- **`X-Goog-AuthUser`:** the account index. It was `0` in every live capture (VERIFIED-LIVE). It stays `0` only when the paired account is the first one signed in to that browser (INFERRED).
- **Per-call header selection (OBSERVED [B@1094258]):** the Google-account auth provider returns only `X-Goog-Api-Key` when a call's option `fg === 1`, and adds the session headers otherwise. `SignInGaia` uses `fg: 2` (OBSERVED). The `fg: 1` call sites found so far are a connectivity check [B@733884], one method of the service wrapper [B@1079138] and a QR-provider registration call [B@1083681] (OBSERVED). None was found on `Messaging/*`.
- **Unknowns** (OPEN-QUESTIONS §17): which cookies the server actually checks (the hash only needs the `*APISID` cookies; `SID`-family validation is INFERRED), and whether `Messaging/*` and `RegisterRefresh` still need cookies after `SignInGaia` returns the token.
- **Hosted connector rule (owner direction, revised A-012):** pasting the user's Google cookies is **not** a primary or default setup path. At most it is an advanced, clearly warned option for people running their own copy, with the A-012 controls (optional variable, minimal set, memory plus encrypted session only, never logged or returned, fail closed).

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

   **Route-14 payload (A-017, OBSERVED):** the payload is relay **f12** [B@1211140], [B@731886]. On the JSPB stream it arrives base64-encoded; once decoded, it is **binary** protobuf (`se` binary reader [B@798993], [B@39414]) and **in the clear**, with no decrypt step before the handler. The top-level message is a oneof over fields 1–9 [B@798710]: f4 = paired, f6 = an empty message, and the other branches are UNVERIFIED. If f4 is absent, pairing fails. Inside f4: f1 phone identity; f2 token {f1 bytes, f2 int64 TTL} [B@732417]; f3 browser identity; f4 bytes (unread by the QR handler, meaning UNVERIFIED).
   - **On f4 the client** disconnects the stream and installs the **new** token (expiry = now + f2/1000 ms). It stores the browser identity and the phone identity as serialized binary under `tachyon_auth_desktop_id` / `tachyon_auth_dest_id` [B@1205154], [B@1211455], then resolves. Reconnect with the new token.
   - **Abandoned pairing:** if the QR screen was abandoned before the scan (INFERRED meaning of the flag set at [B@1206955]), the client installs the token, then calls `RevokeRelayPairing` and fails the pairing. Recommended: a connector whose pairing link has already expired or died should revoke too.
   - The QR-mode `ReceiveMessages` request body is the same as in §6.2 (INFERRED). In QR mode, the phone identity from f4.1 is INFERRED to be the `SendMessage` f1 destination; send it exactly as received (Q-008).
   
   A device identity is a small message with three fields: (1) a type / registration enum (VERIFIED-LIVE value `16` for the GDitto browser device; other values such as `1` appear for RCS identities), (2) a string source ID (VERIFIED-LIVE length 19 in live captures), and (3) a string network (`"GDitto"`, `"RCS"`, or `"Bugle"`). The earlier reading of field 1 as a large int64 user ID is CONTRADICTED by the live capture.

   **Connector pairing page (owner direction, revised A-012 and A-014):** the hosted connector shows the QR only on a short-lived, single-use pairing page that the user opens in their own browser. Tools return only a link and a status (`waiting`, `paired`, `expired`, `failed`), never the QR image, URL or payload. Link controls: at least 128 bits of randomness; a lifetime of no more than the smaller of 120 s and the client-computed QR expiry; bound to its first opener (an `HttpOnly`, `SameSite=Strict` cookie, plus `Secure` except on loopback); `HEAD` and link-preview fetches ignored; dead after one successful pairing; status-only logs. Phone-only users open the link on a second screen. Whether QR pairing still completes for US accounts, and whether a hosted connector can expose an HTTPS address for the page, are **UNVERIFIED** (OPEN-QUESTIONS §18).

5. **QR refresh.** If the QR code expires before it is scanned, the client calls `RefreshPhoneRelay`. The call is authenticated with the token from step 2, and its response field 2 holds a new pairing key, from which a new QR code is built [B@1210378].

6. **Revocation.** `RevokeRelayPairing` takes field 2 = the browser device identity (source ID). It is sent on sign-out [B@1084238]. f2 is the **full browser identity message**, decoded from the stored `tachyon_auth_desktop_id`, not only the source-ID string. It is sent with `fg` 3, and revocation is skipped when no browser identity is stored [B@1083891] (OBSERVED, A-017). That f1 is the auth header is INFERRED from §4.3 (Q-011).

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

**SignInGaia structure from the request builder (A-013 part 1, OBSERVED [B@1093001]):** f1 = AuthMessage (network `"GDitto"`); f2 = a device message with f1 = the device ID, f36 = optional bytes, and f39 = an optional BotGuard token; f3 = mode; f4 = `"GDitto"`. **SignInGaia carries no UKEY2 ClientInit** (OBSERVED). The UKEY2 exchange is carried by `GaiaPairingClient`'s pairing request over the messaging path (OBSERVED, A-013 part 2; see §4.2.1).

- **Mode 1** [B@1093386] is a lookup. Response f3 is a repeated list, entry f1 is decoded as UTF-8 text, and `NOT_FOUND` (code 5) means an empty list (OBSERVED).
- **Mode 0** [B@~1094470] is the sign-in. Response f4.f1 = token and f4.f2 = lifetime in microseconds, capped by a client config value. Response f2 is decoded as UTF-8 text and matched against the mode-1 list entries' f1 (OBSERVED).
- The HAR "init" above is therefore mode 1 and the "confirm" is mode 0 (mode 0 is omitted as the JSPB default) (INFERRED). The "emoji-candidate list" is more likely the mode-1 registration list, and the 36-byte confirm f2 is likely a UUID string (INFERRED). **Device ID (A-013 part 2, OBSERVED):** device f1 is a DeviceId **message** {f1 = enum 3, f2 = string} [B@722726], [B@723098]. The web client fills f2 with `"messages-web-"` followed by either the page constant `DUSI_HASH` [B@804658] or a fresh lower-cased random ID [B@1096360], then persists it. This replaces the earlier "compressed P-256 point" reading (withdrawn). **f36** = the serialized message {f3: 32 fresh random bytes}, which is 34 bytes (b64 length 48) [B@1098826]. It is not emoji material. "Field 36" in the capture is f2.f36 (OBSERVED in the builder).
- **BotGuard (OBSERVED [B@1089513–1090101], [B@~1092700], [B@1093188]):** a BotGuard VM backed by `waa-pa.googleapis.com` (`Waa/Create`, `Waa/Ping`) produces a token that the client attaches at device f39 of SignInGaia mode 0 (flow 3), and at f13.f39 of a second, unidentified Gaia request (flow 2). It does this only when a server-delivered flag is on. If token generation fails, the client sends the request without the token. Whether the server requires the token is **UNVERIFIED** (OPEN-QUESTIONS §19). If it does, Gaia pairing from a non-browser process is very likely blocked (INFERRED).
- **ToS notice (OBSERVED [B@1101393]):** `GaiaPairingClient` writes this literal into the **round-2** pairing request's f8 when the round-1 response's f9 version value is 0 or absent (it is read with default 0 and capped at ≤ 0), and an empty string if f9 is negative. Round 1 never carries f8 (A-015). In practice it is sent on every round 2: *"This is an undocumented API. Use or access of undocumented Google APIs without express authorization is prohibited per the Google API Terms of Service (https://developers.google.com/terms)."* The owner must review this before any public listing.

`CANCEL_GAIA_PAIRING` remains UNVERIFIED.

#### 4.2.1 Pairing rounds, keys and destination (A-013 part 2, A-015; OBSERVED unless marked)

**Order** [B@1111850]: SignInGaia mode 1 (lookup) → choose the destination → SignInGaia mode 0 (token) → open `ReceiveMessages` → round 1 → round 2 → store the keys.

**Destination choice** [B@1108527], [B@1111291], [B@1110530], [B@1109153]:

1. From the mode-1 list, keep entries whose f3 type is 1 or 4.
2. Parse each entry's f8 as {f1 enabled, f2 time ms, f4 pre-warm} and keep enabled entries.
3. Pick the entry with the largest f2.
4. Reject it if its f7 last-update time (µs) is older than a client-config day limit.
5. The entry's **f1 bytes** become the destination, stored decoded as UTF-8 text.

**Pairing request** (schema [B@385305]):

- f1 = session ID, a fresh lower-cased random ID per attempt.
- f2 = browser info [B@1086151].
- f3 = the client's server-adjusted clock time (ms INFERRED); the same value in both rounds.
- f4 = UKEY2 wrapper {f1 type, f2 serialized message}.
- f5 = 1, f6 = 1, f7 = 0, **on round 1 only** [B@1102530]. Each is written through a "clear if equal to default" setter [B@31240], so f7 = 0 is not serialized. Round 2 sets only f1–f4 and f8 [B@1101267].
- f8 = the ToS notice on round 2 (above).

**Transport** [B@1051105], [B@1051293]: unencrypted, 300 s deadline. Action **44** goes to every candidate with qN = 20, and action **45** goes to the responder with qN = 2. See §6.1 for how the destination is addressed.

**Round 1** [B@1102530] carries a type-2 ClientInit [B@781510]:

- version 1;
- 32 random bytes;
- a commitment {f1 = 100, f2 = SHA-512 of the serialized client-finish wrapper};
- next_protocol `"AES_256_CBC-HMAC_SHA256"`.

**Round-1 response** [B@1103140–1103600]:

- f4 must echo the session ID, and the responder must be one of the candidates.
- f1 = status (0 = OK) and f2 = error code.
- **f3 = bool, must be true** [B@1103327].
- f5 = UKEY2 wrapper of type 3 (ServerInit: version 1, a 32-byte random value, cipher 100, and P-256 {x, y} with the 33-byte strip and 32-byte pad).
- f6 ≤ 1, **f7 ≤ 1 (1 = rev1 keys)** and f9 ≤ 0 [B@1101066].

**Round 2** [B@1101267] carries a type-4 ClientFinish {f1 public key {f1 = 1, f2 {f1 x, f2 y}}}, with 0x00-prefixed coordinates [B@195949]. **Round-2 response:** f4 echo, f1 status, and f8 = an optional AES-GCM blob, decrypted with the first payload key and holding fields {f2 bytes, f3 string, f4 string}. Its meanings are UNVERIFIED, so skip it in v1.

**Keys** [B@195193]:

| Output | IKM | salt | info |
|---|---|---|---|
| `S` | SHA-256 of the raw 32-byte ECDH X coordinate | | |
| auth key (emoji source) | `S` | `"UKEY2 v1 auth"` | ClientInit wrapper ‖ ServerInit wrapper, as serialized (binary INFERRED) |
| next key `N` | `S` | `"UKEY2 v1 next"` | same |
| client key | `N` | D2D salt [B@782160] | `"client"` |
| server key | `N` | D2D salt | `"server"` |

All outputs are HKDF-SHA-256 with 32-byte output, exported raw.

**rev1** (round-1 f7 = 1) [B@1099525], [B@195623]:

1. `h(k)`: h = 1, then for each signed byte, h = (31h + byte) | 0.
2. `first` = the key with the smaller h; a tie picks the server key.
3. IKM = SHA-256(D2D salt ‖ first ‖ other).
4. key1 = HKDF(IKM, `"Ditto salt 1"`, `"Ditto info 1"`) and key2 = HKDF(IKM, `"Ditto salt 2"`, `"Ditto info 2"`).

With f7 = 0, the raw client and server keys are used.

**Storage:** key1, or the client key, is stored as `g_crypto_msg_enc_key` (the **AES** key). key2, or the server key, is stored as `g_crypto_msg_hmac` (the **HMAC** key) [B@900177], [B@1078408], [B@1112071]. The destination and the session ID are stored alongside.

#### 4.2.2 Hosted note

`SignInGaia` uses `fg: 2`, which means Google session cookies. A hosted connector without the user's cookies therefore can't run Google-account pairing (OBSERVED for the call option; refusal is INFERRED). See §3 and OPEN-QUESTIONS §17–§18.

#### 4.2.3 Verification emoji (A-015, OBSERVED [P@484686–494473])

The pair page receives the **auth key** and the round-1 **f6** value [B@1112207].

1. `n` = big-endian uint32 of auth key bytes 0–3 [P@491449].
2. If f6 ≥ 1: emoji = `rev1[n % 308]`. If f6 is 0 or absent: emoji = `original[n % 305]` [P@492230].
3. The rev1 list is the original list with duplicates removed (first occurrence kept), then the 14 additions appended in order, then the 10 deletions removed [P@484686].
4. f6 > 1 is unsupported (one code path throws), and the round-1 cap already rejects it.
5. The page also announces a 3-digit code for screen readers [P@489777], [P@492805]: m = n % 1000, and the digits are `m % 10`, `Math.round(m/10) % 10`, `Math.round(m/100) % 10` (`Math.round`, not floor).
6. The tables, check hashes and a spec-team test vector are in `EMOJI-TABLES.md`.
7. Pair-page errors include "No available phones to pair with" (status 6, which routes to setup) [P@489587] and "The user selected the wrong verification code" [P@493360].

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

## 5. Payload encryption between browser and phone: OBSERVED [B@1076193–1077112], [B@1078094] (A-018)

**Wire layout (A-018, OBSERVED; this corrects v0.4 and earlier).** Envelope f5 (outbound) and f8 (inbound) carry a **flat** byte string, **not** a container protobuf:

`ciphertext ‖ IV (16 bytes) ‖ HMAC-SHA256 tag (32 bytes)`

- **Which code.** Both crypto services that produce and consume these fields share one base class: `BugleGCryptoService` for Google-account mode (keys `g_crypto_msg_enc_key` / `g_crypto_msg_hmac`) [B@1078384], and `BugleQrCryptoService` for QR mode (`crypto_msg_enc_key` / `crypto_msg_hmac`) [B@1203957]. Their encrypt/decrypt methods use the cipher class at [B@1076193].
- **Encrypt** [B@1076258]: IV = 16 random bytes, used as the whole 128-bit AES-CTR counter block (`length: 128`). The AES key is a raw AES-CTR key of 16 or 32 bytes (32 in practice). ct = AES-CTR(key, IV, plaintext). tag = HMAC-SHA256(hmacKey, ct ‖ IV), the full 32 bytes. Output = ct ‖ IV ‖ tag.
- **Decrypt** [B@1076632]: reject inputs shorter than 48 bytes. The tag is the last 32 bytes; verify it in constant time over everything before it. The IV is the 16 bytes before the tag, and the ciphertext is the rest.
- **Empty plaintext is passed through unencrypted** [B@1078094]. Both directions return a zero-length input unchanged, so actions whose request message is empty (31 and 17) send an **empty f5**. This is consistent with the capture notes, which record f5 for actions 1, 16, 37 and 52 but not for 31 (INFERRED).
- **Size check.** The overhead is 48 bytes, so the live 51–55-byte f5 values are 3–7-byte plaintexts. Action 16's 7-byte plaintext (§7.1) gives 55 (INFERRED match). The earlier CONTRADICTED note (f5 did not parse as a container) is explained by this layout.
- **Plaintext encoding: binary protobuf** (A-018, OBSERVED). Requests are serialized by the `_.ue` / `_.te` serializers [B@39701], which run the binary writer [B@290984]. Responses are parsed by the binary reader `_.se` [B@39414]. It is proto3-style: default values (0, "", false) are not written.
- The `{f1 scheme, f2 IV, f3 ciphertext, f4 HMAC}` container class at [B@848151–850900] (scheme 2 = AES-CTR + HMAC over ct ‖ IV; scheme 1 = AES-128-GCM with a 12-byte nonce, keyed with the first 16 bytes of the AES key) is a **different helper**. It is not what goes on the wire for actions.
- The algorithms are OBSERVED in JS and still need the known-plaintext round trip in OPEN-QUESTIONS §2. Unencrypted actions (44, 45, 48) place clear protobuf in field 3 of the outbound envelope instead. Inbound, plaintext is in response-envelope field 5 and ciphertext in field 8 (§6.2).

## 6. Request and response envelope

### 6.1 Outbound to the phone (`Messaging/SendMessage`), OBSERVED [B@1048322], [B@367611], [B@948653]

Each phone-bound action is built in three layers.

**(a) Inner action envelope.** This is built for every action call:

| Field | Meaning |
|---|---|
| 1 | Request ID (a UUID string; the client reuses it to match the response) |
| 2 | Action type (an integer from §7) |
| 3 | Unencrypted payload bytes (used only for actions sent "unencrypted"; see §7). Otherwise it is set to an empty string. |
| 5 | Encrypted action-request bytes, flat ct ‖ IV ‖ HMAC (§5, A-018). VERIFIED-LIVE present for actions 1, 16, 37, 52. Empty when the request message is empty (actions 31, 17). |
| 6 | Session ID, bytes len=36 (uuid). VERIFIED-LIVE present once the browser session is active. |

**(b) Relay `SendMessage` request (VERIFIED-LIVE).** JSPB fields:
- Field 1 = in **Google-account mode, the account's Id, not the phone's**: {f1 = 16, f2 = the signed-in account's email (page constant `GA_EMAIL` [B@804551]), f3 = `"GDitto"`} [B@1099025] (OBSERVED, A-015; this corrects the earlier "destination device identity" reading). Never log it. In QR mode, the paired phone identity is INFERRED (§4.1 step 4).
- Field 2 = Message: f1=messageId (uuid), f2=message type (**19** for all phone-bound RPCs in the capture), f5 = 0, f12=serialized action envelope, f23=`[null, qN]` where qN is a small int hint (2 by default; 16 with action 1; 20 with action 44) [B@1079931].
- Field 3 = AuthMessage.
- Field 5 = optional deadline in microseconds (observed 300000000 = 5 min, 86400000000 = 24 h).
- Field 9 = **repeated registration-ID bytes that select the phone(s)** [B@1098597] (OBSERVED, A-015). Round 1 lists every candidate and round 2 the responder. Other calls with no explicit targets use [the stored destination as UTF-8 bytes]. The live 36-byte value fits a UUID-string registration ID (INFERRED). Its JSPB form (base64 string or other) is UNVERIFIED.

Encoding notes (Q-008): the capture walker reported f12 as protobuf fields with byte lengths, which fits a **base64 string of a binary-protobuf envelope** inside the JSPB (INFERRED). Envelope f1/f6 are 36-byte values (UUID text form INFERRED). qN values recorded: 2 (most), 16 (action 1), 20 (action 44); any other qN is UNVERIFIED. Deadline per action is UNVERIFIED. As a working rule, READ → 24 h (`864E5` accompanies most READs in JS) and WRITE → 5 min (INFERRED).

The HTTP response is only a small relay ack (`[[null, digits], digits]`), not the action result. Action results arrive on `ReceiveMessages` (stream body was not retained in browser HAR exports).

**(c)** The request is sent with `Content-Type: application/json+protobuf`.

### 6.2 Responses from the phone

Responses do not come back on the `SendMessage` HTTP response. They arrive asynchronously on the `ReceiveMessages` stream and are matched to requests by envelope f1, the request ID [B@1045827], [B@1048078] (OBSERVED, A-015).

- **`ReceiveMessages` response** (A-016, OBSERVED [B@732839], [B@732854]): **f1** = a small header submessage (no accessors in this bundle), then a **oneof over fields 2–7**, so each stream element carries **at most one** relay message:
  - **f2** = the relay message (below). The client logs `Received message <relay f1>` [B@740117].
  - **f3** = an empty marker. The client only records a timestamp for it [B@740040]. INFERRED to be a server heartbeat.
  - **f4 / f5** = batch start / batch end. The client buffers relay messages from an f4 element until the next f5 element and then emits them together [B@737538], [B@737634], [B@116451]. The mechanism is OBSERVED and the meaning INFERRED. Processing relay messages in arrival order and treating f4/f5 as no-ops is correct.
  - **f6, f7**: no reader found. UNVERIFIED, so ignore them.
  - Any element resets the client's stream-idle timer, and the timer firing triggers a rebind [B@739898]. The timeout comes from client config (UNVERIFIED value).
- **Relay message:** the client handles an inbound relay message only when its **f2 = 19** [B@1069061]. Its **f12** = the response envelope bytes, its **f1** = its own ID (logged as "tachyonId"; INFERRED to be the `AckMessages` ID), its **f3** = a timestamp (int64 µs, INFERRED unit) that the client keeps as "last seen" for the next stream start [B@737471], [B@735540], and its f7 = a time value used for clock skew.
- **Dedup:** when a client flag enables it, the client drops relay messages whose f1 it has already seen, using a 200-entry LRU [B@737044], [B@737379]. Doing the same is cheap and safe.
- **Response envelope** (schema [B@368936]). This is a different message from the outbound envelope:

| Field | Meaning |
|---|---|
| 1 | Request ID (string) |
| 2 | Message (UNVERIFIED meaning) |
| 3 | Timestamp, µs (int64) |
| 4 | Action type |
| 5 | **Plaintext** payload bytes |
| 6 | bool (UNVERIFIED) |
| 8 | **Encrypted** payload bytes |
| 9 | bool, **"session preempted"**: the client goes inactive with reason `INACTIVE_PREEMPTED_RPC` |
| 10, 11 | bytes. f11 is decrypted separately (an account-migration notice, INFERRED) |

- **Plaintext or encrypted:** for actions **44, 45 and 47** (and action 16 when its plaintext type is 14) the client reads the payload in the clear from **f5**. For everything else it decrypts **f8** and writes the result into f5 before parsing [B@1069498], [B@1069778]. This corrects the earlier note that f5 holds the encrypted response.
- **`ReceiveMessages` request** [B@739513]: f1 = AuthMessage and f4 = {f1 = start timestamp µs}. The start timestamp is the last seen relay f3 − 1, or else (server time − 60 s) × 1000 [B@735540], [B@737471].
- **AuthMessage** [B@729780], [B@1094378]: f1 = request ID, f3 = network (`"GDitto"` in Google-account mode), f6 = token bytes (from SignInGaia response f4.f1), f7 = config. Before a call with the default option, the client refreshes the token once 95 % of its lifetime has passed [B@728364].

## 7. Action catalog

Action numbers are OBSERVED as the `Gc:` value passed to the client's action dispatcher, together with the READ/WRITE/ACK class it records (`Cd`). Purposes are INFERRED from the surrounding code (argument names, return shapes, and log strings) unless marked otherwise. A `864E5` (24 h) value accompanies most READs and appears to be a timeout or cache lifetime (INFERRED). **Live capture counts** (action envelope field 2): pairing HAR — 37×10, 48×2, 52×2, 1×1, 16×1, 31×1, 44×1, 45×1, 53×1; send HAR — 37×8, 49×3, 29×2, and 1× each of 22, 6, 28, **9**, 21, **2**, 32, **3**; typing/media HAR — **22**×2, **3**×1 (media); reaction HAR — **38**×1, **22**×1. Purposes remain INFERRED unless marked VERIFIED-LIVE.

| Action | Class | Inferred purpose (evidence) |
|---|---|---|
| 1 | READ | **List conversations.** Layout in §7.1 (A-018) [B@1058593]. Response f2 = repeated Conversation (§7.2), f5 = cursor. |
| 2 | READ | **List messages in a conversation.** Layout in §7.1 (A-018) [B@1059477]. Response f2 = repeated Message (§7.2), f5 = cursor. It throws "Conversation not found" when the list is empty. **VERIFIED-LIVE** (1× right after action 9 when opening the new thread). |
| 3 | WRITE | **Send message.** JS: request has field 2 = conversation ID, field 5 = a client temporary message ID, optional field 4 = SIM/sender, optional boolean field 6, and the message content; response field 2 = message ID and field 3 = status [B@1063354]. **VERIFIED-LIVE:** exactly one action-3 in the send capture; action envelope f1=reqId(36), f2=3, f5=opaque 295 B (42-char plaintext), f6=sessionId(36); outer Message.f1 = client message uuid; Message type 19. Inner plaintext field layout of f5 remains opaque (encrypted). |
| 6 | READ | **List or search contacts** (limit, query, paging). Response field 2 = contacts, field 3 = cursor. |
| 9 | WRITE | **Get or create a conversation** from a list of destinations (E.164 / address identities); it optionally creates an RCS group and accepts a group name in field 3 (`createConversation`). **VERIFIED-LIVE** as the get-or-create step after LookupRegistered (1× in send capture; f5 opaque len=86). |
| 10 | WRITE | Takes field 2 = conversation ID and field 3 = a message ID; there is no response type. Likely **mark read up to message** (UNVERIFIED). |
| 12 | READ | Per-conversation boolean setting (field 3) with an optional SIM payload. Possibly **notifications/mute** (UNVERIFIED). |
| 13 | WRITE | **Update settings.** It carries many boolean and enum preference fields and returns the settings blocks. |
| 15 | WRITE | **Update conversation status.** Field 3 = conversation ID and field 2 = a status code. The unarchive path uses 3, and an archive/delete-style pair uses 5/6 (UNVERIFIED which is which). |
| 16 | READ | **Activate session.** Request f2 = int64 ms timestamp (§7.1). Request ID = the new session ID; sent together with action 31 when the browser becomes active [B@1053783]. No direct response is parsed. Push updates arrive as inbound action-16 envelopes (§8, A-019). |
| 17 | ACK | **Acknowledge.** An empty request (so f5 is empty, §5), sent when a push update carries oneof case f7, the ack request (§8, A-019) [B@1072507], [B@1053121]. |
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
| 31 | READ | **Get capabilities.** Empty request; response f1 = bool that gates send (3), create-conversation (9) and action 23 (§7.1, A-018). |
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

**Still unrecorded (UNVERIFIED):** the destination-list layout of action 9, and the message-content field and response status enum of action 3. Everything in §7.1 and §7.2 is OBSERVED in JS and not yet checked against a live decrypt; field numbers come from the client's message schemas and meanings from what its converters do with each field.

### 7.1 Read-only action layouts (A-018, OBSERVED)

Plaintext is binary protobuf (§5). Proto3-style: fields left at their default are not written.

**Action 16 (activate session)** [B@1053783]: request f2 = int64 timestamp in **milliseconds**, `Date.now()` plus the client's server-clock offset [B@1042865], [B@1042305]. No other fields. Request ID = the new session ID. Sent together with action 31 [B@1053705]. The call has no response type.

**Action 31 (capabilities)** [B@1061905]: the request is an empty message [B@377954], so f5 is empty. Response f1 = bool [B@378030], copied into three capability flags. When false, send (action 3) re-checks once and then fails with result 4 [B@1062944]; create-conversation (9) and action 23 are gated the same way.

**Action 1 (list conversations)** [B@1058593], request schema [B@379448]:

| Field | Type | Value |
|---|---|---|
| f2 | int32 | count, always **25** [B@379247] |
| f3 | string | not set by the client |
| f4 | enum | folder/status filter; the client maps 1:1 onto {1, 2, 3, 5, 6}, plus 8 behind a flag [B@1039672]. The startup inbox load uses **1** [P@471276]. Other meanings UNVERIFIED. |
| f5 | message | cursor {f1 string (a conversation ID), f2 int64 (INFERRED a timestamp)} [B@379210]. Omit on the first page; afterwards send back the previous response's f5 unchanged. |

Response [B@379558]: f2 = repeated Conversation (§7.2), f3 string and f4 int32 (unread by the list code), f5 = cursor. `SendMessage` f23 qN = 16 on the session's first action 1 and unset afterwards [B@1058737] (matches the live "16 with action 1").

**Action 2 (list messages)** [B@1059477], request schema [B@380162]:

| Field | Type | Value |
|---|---|---|
| f2 | string | conversation ID |
| f3 | int32 | count, always **50** [B@379980] |
| f4 | string | not set by the client |
| f5 | message | cursor {f1 string, f2 int64} [B@379910]; send back the previous response's f5 |
| f6 | message | conversation reference {f1 conversation ID, f2 RCS group {f1 group ID}, f3 string} [B@366563], [B@214419], [B@366033]. For a normal thread, f6.f1 = the same conversation ID. |

Response [B@380356]: f2 = repeated Message (§7.2), f3 string, f4 int32, f5 = cursor. An empty f2 on the first page means "Conversation not found".

### 7.2 Conversation, Participant, Message and part layouts (A-019, OBSERVED)

Participant names, addresses and message text are personal data: never log them; log field numbers and lengths only.

**Conversation** (action 1 response f2; push case f2). Schema [B@366591], class [B@366302], converter [B@1036507].

| Field | Type | What the client does with it |
|---|---|---|
| 1 | string | conversation ID |
| 2 | string | display name |
| 4 | message | latest-message preview {f1 text, f2 bool (INFERRED the same "outgoing" flag as on Message), f3 enum type, f4 string, f5 status (same type as Message f4)} |
| 5 | int64 | last-activity time, **µs** (the client divides by 1000) |
| 6 | int32 | treated as a flag when > 0 (INFERRED unread count) |
| 10 | bool | INFERRED group flag (the client builds a label from up to four non-self participants when it's set and no label exists) |
| 12 | enum | status, same value set as the action-1 filter [B@1036348] |
| 20 | repeated message | participants |
| 22 | enum | type, values 1 and 2 (meaning UNVERIFIED) |
| 28 | int64 | µs timestamp (meaning UNVERIFIED) |
| 31 | message | conversation reference (as action 2 f6) |
| 34 | string | custom icon URL |

Fields 7, 9, 11, 13–19, 21, 23–27, 29, 30, 32, 33 and 35–42 also exist and aren't needed for read-only.

**Participant** (Conversation f20) [B@365516]: f1 identity {f1 enum type, f2 string, f3 string} [B@365270], [B@365164] — the client uses identity f2 as both the participant ID and the displayed destination (INFERRED the address); f2 first name; f3 full name; f6 bool is-self; f7 SIM (required by the converter); f15 display name; f21 profile {f1 display name, f2 first name, f3 …}. Fields 4, 5, 8–14 and 16–20 are UNVERIFIED.

**Message** (action 2 response f2; push case f3). Schema [B@374313], class [B@374070], converter [B@1026525].

| Field | Type | What the client does with it |
|---|---|---|
| 1 | string | message ID |
| 4 | message | status: **f2** = status code (enum), f5 = status text, f6 = bool [B@364182], [B@364256] |
| 5 | int64 | timestamp, **µs** |
| 7 | string | conversation ID |
| 9 | string | INFERRED sender participant ID |
| 10 | repeated message | parts, in order |
| 11 | enum | message type, values 1–6 (UNVERIFIED meanings) |
| 12 | string | INFERRED client temporary ID (the send path writes the same model property into action 3 f5) [B@1027542], [B@1063227] |
| 13 | message | INFERRED reply quote {f1 string, f2 int64 µs, f3–f6 strings} |
| 16 | bool | special message (below) |
| 19 | repeated message | reactions {f1 {f1 emoji string, f2 type enum}, f2 repeated participant IDs} [B@372571] |
| 23 | message | conversation reference |
| 29 | string | RCS group ID |

- **Direction:** outgoing when the status code is 1–99 [B@1027337] (rule OBSERVED, meaning INFERRED); 100 and above is incoming.
- **Status grouping** [B@1025782] (category names are not in the bundle): {3, 4, 5, 6, 7, 10} → 1; {1, 15} → 2; {2} → 3; {11} → 4; {8, 9, 12, 13, 19, 21, 22, 24, 27, 114} → 5 (INFERRED failed, the only category with a failure reason [B@1026337]); {14} → 7; {300} → 8; {102–105} → 9; {101, 106, 110, 115} → 10; {107, 111, 112} → 11. Expose the raw code plus direction until a live test confirms names.
- **Special messages:** f16 = true, or a status code of 200–211 or 217, takes a short path with no parts rendered (INFERRED system/tombstone event).
- **Unread** is not a Message field (see Conversation f6).

**Message part** (Message f10): f1 part ID, then a **oneof over 2–6** [B@372180]: f2 text {**f1 = text**} [B@1028637]; f3 media {f1 content-type enum: 1–6 images (jpeg, jpg, png, gif, wbmp, bmp), 8–13 video, 14–23 audio, 24 vCard, 38–43 calendar, other = attachment} [B@1027967], [B@1030450]; f5 location {f2 text}; f6 rich card {f1 JSON string, f2 type} (behind a flag). For read-only text, take f2.f1 of each text part in order.

Text send (action 3) and get-or-create conversation (action 9) are VERIFIED-LIVE. Media sending, mark-read, typing, and delete-message are not yet mapped with confidence. See open questions. A parallel RCS-plane SendMessage with message type 36 on jms-us follows Bugle action 3 (text) and action 38 (reaction); role still UNVERIFIED but recurrence is VERIFIED-LIVE. Media send uses action 3 after Copper+Bugle uploads (§9).

## 8. Incoming event stream and acknowledgements

- The browser keeps one `ReceiveMessages` stream open at a time. Inbound relay messages carry a route or type number in f2. **14** is the QR pairing event and **19** carries a phone response envelope (OBSERVED). Heartbeats are not relay messages: they are the `ReceiveMessages` response f3 marker (§6.2, A-016, INFERRED meaning). Other route numbers are UNVERIFIED.
- When the browser becomes the active client, it picks a new session ID (a UUID), stores it, sends action 16 with that ID as the request ID, and requests capabilities with action 31 [B@1053783]. If a previous session ID exists, the client may resume it. Each of 16 and 31 was seen once in the live pairing capture. Whether other actions go unanswered without 16 → 31 is UNVERIFIED, so send them first (Q-011).
- **Push updates (A-019, OBSERVED [B@1068983–1073227]).** They arrive as inbound relay messages (f2 = 19) whose response envelope has **action (f4) = 16** and **request ID (f1) = the current session ID**. Envelopes for any other action are responses to pending requests, matched by request ID [B@1069227]. Routing detail [B@1069100–1070300]: with no current session, an action-16 envelope is ignored unless its request ID matches a pending request. Otherwise a 16 envelope is handled as a push update if its request ID is the session ID or matches a pending request. With any other ID it is still decrypted, but it is handled only when it is a user alert (f6) of type 2 ("browser active") and relay f7 is not > 0; otherwise it is ignored (the "Ignoring RPC" path [B@1051909]). An HMAC failure ("invalid MAC") drops the envelope and puts the client in an error state (INFERRED) [B@1069835]. If envelope f11 is non-empty, the client decrypts it as a QR-migration notice (it can carry an account email: never log it) and, unless the action is 1, stops there [B@1069426], [B@1052142]. After decrypting f8, the plaintext is one message with a **oneof over fields 2–16** [B@377357], [B@376884]:
  - **f2 conversation update** = {f2 repeated Conversation (§7.2), f3 string} [B@367085], [B@1070591]
  - **f3 message update** = {f2 repeated Message (§7.2), f3 string} [B@376057], [B@1070524]
  - f4 typing = {f2 repeated {f1 conversation ID, f2 identity, f3 bool typing, f4 conversation reference}} [B@376753], [B@376672], [B@1072530]
  - f5 settings; f6 user alert {f2 type: 1 preempted, 2 browser active, 7 inactive (timeout), 8 inactive (lack of activity), 3/4 data connection, 5/6 battery} [B@1071536]
  - **f7 ack request → the client sends action 17** [B@1072507], [B@1053121]
  - f14 Google-account unpair [B@1072716]; f15 QR migration {f1 string (may be an account email: never log it), f2 bool} [B@375875]; other cases aren't needed for read-only.
  - **Stale updates:** the client drops an update for a conversation or message ID whose envelope f3 timestamp is older than the last applied for that ID (`conv_<id>`, `msg_<id>`, 1000-entry LRU) [B@1073227], [B@1052571], [B@1054822]. The check is per element (each Conversation in f2, each Message in f3), the comparison is strict (an equal timestamp is applied), and the stored timestamp is updated whenever an element passes. Settings (f5) use the single key `settings` and QR migration uses `qr_migration`. The placeholder check below runs after the stale check, so a skipped placeholder still advances the stored timestamp [B@1052571].
  - **Placeholders:** a message update is rendered only if its status is 300, or it is type 3 with a status other than 105, or every part has a content case [B@1052849]; otherwise it waits for a later update (INFERRED).
  - The names `CONVERSATION_UPDATE` / `MESSAGE_UPDATE` don't appear on the wire; these oneof cases are the mapping.
- **Request classes and deadlines (OBSERVED [B@1047962]).** Each action is sent with a class (`READ`, `WRITE` or `ACK`) and an optional deadline (`Vf`, ms). The class is not on the wire: `WRITE` requests are queued so that only one runs at a time, while `READ` and `ACK` go out immediately. Explicit deadlines: 31, 1 and 2 use 864E5 ms = 24 h [B@1062006], [B@1058838], [B@1059576]; action 17 is class `ACK` with 24 h [B@1053193]. Action 16 (`READ`) and the writes seen so far (3, 23) pass no explicit deadline, so the default applies (UNVERIFIED; the 5 min seen live is the working assumption). Actions without a response type (16, 17) resolve as soon as they are sent.
- The client acknowledges processed relay messages with `Messaging/AckMessages` (VERIFIED-LIVE): request = `[AuthMessage, repeated messageId uuid strings]` (1–6 IDs per call observed); response = `[[null, digits]]`. Action 17 (application-level ack) is sent in reply to push case f7 (above); it was not observed in live captures.
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
- An unpair initiated by the phone is UNVERIFIED. The route-14 container is a oneof over fields 1–9, with f4 = paired and f6 = empty (A-017 [B@798710]). Whether one of the other branches signals revocation is UNVERIFIED.
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
