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
| API key source | page-config const `A16fYe` in `window.MW_CONFIG` ([3][0] list, `[name, [null, null, str]]`), read at runtime; env override | A-003 follow-up (#3), [B@811680], [B@806731] | ✅ (VERIFIED-LIVE 2026-10-18 with the pinned UA) | `transport/pageConfig.ts` |
| Page-fetch User-Agent | pinned current desktop Chrome UA (Linux); page fetch only; 200 without MW_CONFIG = failure | A-003 part 3 (#3), VERIFIED-LIVE table | ✅ | `transport/pageConfig.ts` |
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
| Paired container | binary oneof f1–f9; f4 = {f1 phone id, f2 token, f3 browser id, f4 bytes (UNVERIFIED)}; no f4 = failure | §4.1 step 4, A-017 [B@798710], [B@1211182] | ✅ | `protocol/pairing.ts` |
| Route-14 path | relay f2 = 14; payload = relay f12, binary, in the clear | A-017 [B@1211140], [B@731886], [B@798993] | ✅ | `protocol/pairing.ts` |
| After route 14 | new token replaces the RegisterPhoneRelay token; late pairing (link dead) → revoke | A-017 [B@1211140–1211700], [B@1206955] | ✅ | `pairing/qrPairing.ts` |
| RevokeRelayPairing | f2 = full browser identity message; f1 auth header (INFERRED) | A-017 [B@1083891] | ✅ | `protocol/pairing.ts` |

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
| Outbound envelope | f1 reqId, f2 action, f3 clear, f5 ciphertext, f6 sessionId | §6.1(a) [B@367611] | ✅ | `protocol/messaging.ts` |
| Inbound envelope | f1 reqId, f3 ts µs, f4 action, f5 plaintext, f8 encrypted, f9 preempted | A-015 item 2 [B@368936] | ✅ | `protocol/messaging.ts` |
| Clear responses | actions 44, 45, 47 in f5; others decrypt f8 | A-015 [B@1069498], [B@1069778] | ✅ | `protocol/messaging.ts` |
| Relay message | f1 id, f2 type (19), f3 timestamp (last seen), f7 time, f12 envelope | A-015 [B@1069061], A-016 [B@737471] | ✅ | `protocol/messaging.ts` |
| ReceiveMessages response | element "1"; f1 header; oneof f2 relay, f3 heartbeat, f4 batch start, f5 batch end, f6/f7 unknown | A-016 [B@948653], [B@732854], [B@740040], [B@737538] | ✅ | `protocol/messaging.ts` |
| Relay dedup | by relay f1, 200-entry LRU | A-016 [B@737044] | ✅ | `protocol/messaging.ts` |
| Resume value | f3 of the latest relay message that passed dedup (not the max) | A-017 [B@737226], [B@737471] | ✅ | `session/stream.ts` |
| ReceiveMessages request | f1 AuthMessage, f4 {f1 start µs}; default (server ms − 60 s) × 1000 | A-015 [B@739513], [B@735540] | ✅ | `protocol/messaging.ts` |
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
| Ditto key ordering | h = 1; h = (31h + signed byte) \| 0; smaller h first, tie → server; IKM = SHA-256(salt ‖ first ‖ other); key1 → AES, key2 → HMAC | A-013 pt 2 [B@195200], [B@1099525], SPEC §4.2 | ✅ | `crypto/ukey2.ts` |
| rev1 selector | round-1 response f7 = 1; f7 = 0 → raw client key = AES (`g_crypto_msg_enc_key`), server key = HMAC | A-013 pt 2 [B@1102309], A-015 item 5 [B@900177], [B@1078408] | ✅ | `crypto/ukey2.ts` |
| next_protocol | `"AES_256_CBC-HMAC_SHA256"` | A-013 pt 2 [B@781510] | ✅ | `crypto/ukey2.ts` |
| ClientFinished coords | 0x00-prefixed (33 bytes) | A-013 pt 2 [B@195949] | ✅ | `crypto/ukey2.ts` |
| HKDF inputs | IKM SHA-256(ECDH X); salt = label, info = ClientInit wrapper ‖ ServerInit wrapper (binary INFERRED) | A-013 pt 2 [B@195324], [B@195697], [B@194835] | ✅ | `crypto/ukey2.ts` |
| Pairing request | round 1: f1 session ID, f2 browser, f3 time (ms INFERRED), f4 UKEY2 wrapper, f5 1, f6 1 (f7 0 unset); round 2: f1–f4 + f8 | A-013 pt 2 [B@385305], A-015 [B@1102530], [B@1101267], [B@31240] | ✅ | `protocol/gaiaPairing.ts` |
| Notice gating | round 2 f8 = notice if round-1 f9 absent/0; empty if f9 < 0 (f9 read signed) | A-015 item 3 [B@282726], [B@1101393] | ✅ | `protocol/gaiaPairing.ts` |
| Round qN | 20 (round 1), 2 (round 2); deadline 300 s | A-015 item 1 [B@1079931] | ✅ | `protocol/gaiaPairing.ts` |
| Pairing rounds | action 44 (ClientInit, all candidates), 45 (ClientFinish, responder); unencrypted; 300 s deadline | A-013 pt 2 [B@1102530], [B@1101267], [B@1051105] | ✅ | `protocol/gaiaPairing.ts` |
| Round-1 response | f1 status, f2 error, f3 bool (must be true), f4 echo, f5 ServerInit wrapper, f6 ≤ 1, f7 ≤ 1, f9 ≤ 0 | A-013 pt 2, A-015 item 4 [B@282592], [B@1103327] | ✅ | `protocol/gaiaPairing.ts` |
| Round-2 response | f4 echo, f1 status, f8 optional AES-GCM blob (skipped) | A-013 pt 2 [B@1102106], [B@1112239] | ✅ | `protocol/gaiaPairing.ts` |
| Notice literal | Google's "undocumented API … Terms of Service" string in f8 | A-013 [B@1101393] | ✅ | `protocol/gaiaPairing.ts` |
| Verification code | n = uint32 BE(authKey[0..4]); f6 ≥ 1 → rev1[n % 308] else original[n % 305]; digits via Math.round | A-015 [P@491449], [P@484686], [P@492230], [P@492805] | ✅ (tables checked against A-015 hashes) | `pairing/verificationCode.ts` |
| Gaia SendMessage | f1 = account Id {16, GA_EMAIL, "GDitto"}; f9 = repeated registration-ID targets (JSPB encoding UNVERIFIED) | A-015 item 1 [B@1099025], [B@1098597] | ✅ | `protocol/messaging.ts` |
| SignInGaia request | f1 auth (GDitto), f2 device {f1 DeviceId, f36 opt, f39 opt anti-abuse}, f3 mode, f4 "GDitto" | A-013 [B@1093001] | ✅ | `protocol/signInGaia.ts` |
| DeviceId | [3, "messages-web-<lower-cased random id>"] (UUID form is our choice) | A-013 pt 2 [B@722726], [B@1096360] | ✅ | `protocol/signInGaia.ts` |
| f36 | serialized {f3: 32 random bytes} (34 bytes) | A-013 pt 2 [B@1098826] | ✅ | `protocol/signInGaia.ts` |
| Destination choice | lookup entries type 1/4, f8 {f1 enabled, f2 time ms, f4 prewarm} enabled, max f2; f7 µs age limit (config, UNVERIFIED); entry f1 bytes = destination | A-013 pt 2 [B@1108527], [B@1111291], [B@1110530], [B@1109153] | ✅ | `protocol/signInGaia.ts` |
| SignInGaia modes | 1 lookup (resp f3 list, entry f1 UTF-8), 0 sign-in (resp f2 UTF-8 ID, f4 token); NOT_FOUND (5) = empty | A-013 [B@1093386], [B@~1094470] | ✅ | `protocol/signInGaia.ts` |
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
