# Protocol constants and their sources

Required by clean-room control A-006 §1/§3. Every protocol constant used in `src/` is listed here with its source. The spec team reviews this table before each phase is merged and records the result in `docs/handoff/QUESTIONS.md`.

Source keys: **§x** = `docs/handoff/SPEC.md` section; **A-0NN** = spec-team answer on GitHub issue; **[B@n]** = byte offset in Google's public `mw_b` bundle, build `messagesweb.mw.en_US.4-84y6pqYJM.O`, read by the implementer under rule 2 and logged in `DEVLOG.md`; **pub** = public standard.

Status: ✅ spec/answer; 🟡 from implementer's bundle read, **pending spec-team review**; ⛔ gap (code throws `SpecGapError`).

## Hosts, paths, headers

| Constant | Value | Source | Status | Code |
|---|---|---|---|---|
| QR relay base | `https://instantmessaging-pa.googleapis.com` | §2 (`solGAe`) | ✅ | `transport/relay.ts` |
| RPC path prefix | `/$rpc/google.internal.communications.instantmessaging.v1.` | §2 | ✅ | `transport/relay.ts` |
| `X-User-Agent` | `grpc-web-javascript/0.1` | §3, A-003 | ✅ | `transport/relay.ts`, `transport/receive.ts` |
| Content types | `application/x-protobuf` (Pairing), `application/json+protobuf` (Messaging/Registration) | §3, A-003 | ✅ | `transport/relay.ts` |
| API key source | page-config constant `A16fYe` | [B@811680], [B@1083605], [B@1094258] | 🟡 (Q-003, #3) | `specGaps.ts` (runtime read not yet built) |
| QR base URL | `https://support.google.com/messages/?p=web_computer` | §4.1 step 3 (INFERRED) | ✅ (library only; QR not exposed, A-007) | `protocol/pairing.ts` |

## AuthMessage and identities

| Constant | Value | Source | Status | Code |
|---|---|---|---|---|
| AuthMessage fields | f1 requestId, f3 network, f6 token, f7 ConfigVersion | §0.1.3 | ✅ | `protocol/auth.ts` |
| Network strings | `Bugle`, `GDitto`, `RCS` | §4.1 step 2, §0.1.1 | ✅ | `protocol/auth.ts` |
| ConfigVersion fields | f3 year, f4 month, f5 day, f7 V1, f9 V2 | [B@973382] + A-001 values | 🟡 (#1) | `protocol/auth.ts` |
| ConfigVersion values | 2026/10/15/4/6 | A-001 (VERIFIED-LIVE) | ✅ | `protocol/auth.ts` |
| Device identity | [type, sourceId, network]; type 16 = GDitto browser | §4.1 step 4 | ✅ | `protocol/auth.ts` |
| Token submessage | f1 token, f2 TTL (µs) | §4.1 step 2, §4.3 | ✅ | `protocol/auth.ts`, `protocol/pairing.ts` |

## QR pairing (secondary, library only)

| Constant | Value | Source | Status | Code |
|---|---|---|---|---|
| RegisterPhoneRelay | f1 auth header {f1 reqId, f3 network}, f3 browser details, f4 key data | §4.1 step 2 | ✅ | `protocol/pairing.ts` |
| Key-data nesting | f4 = {f6 = {f1 = 2, f2 = SPKI DER}} | [B@1083605], [B@722929], [B@723205] | 🟡 (#2) | `protocol/pairing.ts` |
| Browser details | f1 UA, f2 type (other = 1), f3 OS, f5 bool, f6 enum | §4.1 step 2, A-005, [B@1085900] | ✅ / 🟡 defaults f5 = false, f6 = 1 (#5) | `protocol/pairing.ts` |
| SPKI DER | 91 bytes, prefix `3059301306072a8648ce3d0201`; OIDs 1.2.840.10045.2.1 / 1.2.840.10045.3.1.7 | §4.1 step 2, A-002, pub (RFC 5480) | ✅ | `crypto/deviceKey.ts` |
| Response | f3 pairing key, f5 token | §4.1 step 2 | ✅ | `protocol/pairing.ts` |
| RefreshPhoneRelay response | f2 new pairing key | §4.1 step 5 | ✅ | `protocol/pairing.ts` |
| QR payload | {f1 pairing key, f2 AES key, f3 HMAC key}, `#?c=` | §4.1 step 3 | ✅ | `protocol/pairing.ts` |
| Paired container | f4 = {f1 phone id, f2 token, f3 browser id}; route 14 | §4.1 step 4 | ✅ | `protocol/pairing.ts` |
| Route-14 stream path | — | — | ⛔ Q-004 | `protocol/pairing.ts` |

## Crypto

| Constant | Value | Source | Status | Code |
|---|---|---|---|---|
| Request signing | ECDSA P-256 / SHA-256 | §4.1 step 1, §4.3 | ✅ | `crypto/deviceKey.ts` |
| Payload keys | 32-byte AES, 32-byte HMAC | §4.1 step 1, §5 | ✅ | `crypto/payload.ts` |
| Scheme 2 | AES-256-CTR, 16-byte IV, HMAC-SHA256 over CT‖IV, 32-byte tag | §5 | ✅ | `crypto/payload.ts` |
| Scheme 1 | AES-128-GCM (first 16 key bytes), 12-byte nonce, 16-byte tag | §5 | ✅ | `crypto/payload.ts` |
| Container | {f1 scheme, f2 IV, f3 CT, f4 tag} | §5 | ✅ | `crypto/payload.ts` |
| Flat layout | CT‖IV‖HMAC | §5, OPEN-QUESTIONS §2 (hypothesis) | ✅ (hypothesis) | `crypto/payload.ts` |

## Token lifecycle

| Constant | Value | Source | Status | Code |
|---|---|---|---|---|
| RegisterRefresh request | f1 auth, f2 browser id, f3 time µs, f4 sig over `"<reqId>:<ts>"` | §4.3 | ✅ | `protocol/refresh.ts` |
| RegisterRefresh response | f2 token, f3 clock-rejected, f4 server time, f8 string | §4.3 | ✅ | `protocol/refresh.ts` |
| Refresh timing | 90% scheduled, 95% pre-call; backoff base 2 from 1000 ms | §4.3 | ✅ | `session/schedule.ts` |
| Retryable gRPC codes | 1, 2, 4, 10, 13, 14 | §11 | ✅ | `session/schedule.ts` |

## Messaging

| Constant | Value | Source | Status | Code |
|---|---|---|---|---|
| Action envelope | f1 reqId, f2 action, f3 clear, f5 opaque, f6 sessionId; f9 preempted (inbound) | §6.1(a), §6.2 | ✅ | `protocol/messaging.ts` |
| Envelope in Message.f12 | base64 of binary protobuf | A-008 (INFERRED) | ⛔ Q-008 (gate kept until confirmed) | `protocol/messaging.ts` |
| Message type | 19 | §6.1(b) | ✅ | `protocol/messaging.ts` |
| Message.f23 | [null, qN]; qN 2 / 16 (action 1) / 20 (action 44) | §6.1(b), A-008 | ✅ (others ⛔) | `protocol/messaging.ts` |
| Deadlines | 300000000 µs, 86400000000 µs | §6.1(b), A-008 | ✅ | `protocol/messaging.ts` |
| AckMessages | [AuthMessage, [ids]] | §8 | ✅ | `protocol/messaging.ts` |
| Action numbers | 1, 2, 3, 9, 16, 17, 22, 31, 38 | §7 | ✅ | `protocol/messaging.ts` |
| Stream element | {"1": response, "2": status} | §3 | ✅ | `transport/receive.ts` |

## Google-account pairing (primary)

| Constant | Value | Source | Status | Code |
|---|---|---|---|---|
| D2D salt | `82aa55a0…6da85510` (32 bytes) | §4.2; ukey2 `d2d_crypto_ops.cc` @10fc737 | ✅ | `crypto/ukey2.ts` |
| UKEY2 message types | ALERT 1, CLIENT_INIT 2, SERVER_INIT 3, CLIENT_FINISH 4 | ukey2 `ukey.proto` | ✅ | `crypto/ukey2.ts` |
| Cipher | P256_SHA512 = 100; version 1 | §4.2, `ukey.proto` | ✅ | `crypto/ukey2.ts` |
| ClientInit / ServerInit / ClientFinished fields | 1 version, 2 random, 3 commitments{1 cipher, 2 commitment}, 4 next_protocol / 1,2,3 cipher,4 public_key / 1 public_key | `ukey.proto` | ✅ | `crypto/ukey2.ts` |
| GenericPublicKey | {1 type EC_P256 = 1, 2 {1 x, 2 y}} | `securemessage.proto` | ✅ | `crypto/ukey2.ts` |
| Key schedule labels | "UKEY2 v1 auth", "UKEY2 v1 next", "client", "server" | §4.2 | ✅ | `crypto/ukey2.ts` |
| Ditto labels | "Ditto salt 1/2", "Ditto info 1/2" | §4.2 [B@1099375] | ✅ | `crypto/ukey2.ts` |
| Ditto key ordering rules | — | — | ⛔ Q-013 (#15) | `crypto/ukey2.ts` |
| SignInGaia request | f1 auth (GDitto), f2 device {f1 device ID, f36 opt, f39 opt anti-abuse}, f3 mode, f4 "GDitto" | A-013 [B@1093001] | ✅ | `protocol/signInGaia.ts` |
| SignInGaia modes | 1 lookup (resp f3 list, entry f1 UTF-8), 0 sign-in (resp f2 UTF-8 ID, f4 token); NOT_FOUND (5) = empty | A-013 [B@1093386], [B@~1094470] | ✅ | `protocol/signInGaia.ts` |
| Device-ID origin, f36, UKEY2 placement, emoji | — | — | ⛔ Q-013 part 2 (#15) | — |
| Relay base (Gaia) | `https://instantmessaging-pa.clients6.google.com` | §2 (`tkZp9e`), §0.1.1 | ✅ | — |
| Cookie sources | SAPISID → APISID → __Secure-3PAPISID; __Secure-1PAPISID; __Secure-3PAPISID | A-012 [B@311997–312100] | ✅ | `session/googleAuth.ts` |
| Auth schemes | SAPISIDHASH, SAPISID1PHASH, SAPISID3PHASH | A-012 [B@312700–313300] | ✅ | `session/googleAuth.ts` |
| Hash | SHA-1 hex; timestamped `<s>_<hex>` over `<s> <cookie> <origin>`; untimestamped `<hex>` | A-012 [B@298938] | ✅ (branch choice UNVERIFIED) | `session/googleAuth.ts` |
| Origin | `https://messages.google.com` (rule [B@298200]) | A-012 | ✅ | `session/googleAuth.ts` |
| `X-Goog-AuthUser` | `0` | A-012 (VERIFIED-LIVE) | ✅ | `session/googleAuth.ts` |

## Pairing page (implementation choices, not protocol constants)

| Constant | Value | Rationale | Code |
|---|---|---|---|
| Link lifetime | 120 s | ≤ min(120 s, QR expiry) per A-014; the QR-expiry field is UNVERIFIED (Q-002, #2) | `pairing/qrPairing.ts` |
| First-opener binding | `gm_pair` cookie, HttpOnly, SameSite=Strict, Secure unless loopback, path-scoped; HEAD and preview UAs don't claim | A-014 (#16) | `pairing/pageServer.ts` |
| Link token | 32 random bytes, base64url, compared in constant time | Unguessable single-use link | `pairing/pageServer.ts` |
| Page headers | no-store, no-referrer, CSP `default-src 'none'` + nonces, frame-ancestors none | Keep the QR out of caches, referrers and frames | `pairing/pageServer.ts` |
