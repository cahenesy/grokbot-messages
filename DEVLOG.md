# DEVLOG — sources consulted

Required by clean-room rule 5 (`docs/handoff/README.md`). This log names every URL, document, and capture used while implementing. No secrets go here.

## 2026-10-18

- Handoff package received (version 2026-10-18): `docs/handoff/SPEC.md` v0.2, `OPEN-QUESTIONS.md`, `IMPLEMENTATION-PLAN.md`, `QUESTIONS.md`, `README.md`.
- No other sources consulted yet.
- Public protobuf wire-format knowledge (varint/length-delimited encoding) used for `src/protocol/protobuf.ts`; written from the encoding rules, not from any library source.
- Apache-2.0 license text: https://www.apache.org/licenses/LICENSE-2.0.txt
- Grok Bot hosting environment: web search "Grok Bot connector marketplace plugin requirements license MCP"; https://composio.dev/content/how-to-add-mcp-servers-to-grok-bot (Grok Bot runs stdio MCP servers on a cloud computer). No license requirements found there.
- npm package metadata only (versions, license fields) for @modelcontextprotocol/sdk, zod, qrcode, vitest, typescript.
- Not consulted: any item on the handoff do-not-open list.
- Cursor plugin format: https://cursor.com/docs/plugins and https://cursor.com/docs/reference/plugins (manifest fields, `mcp.json`, `${VAR}` plugin variables, submission checklist; no license requirement stated beyond "open source").

## 2026-10-18 — spec answers A-001…A-011 received (issues #1–#11)

- Owner rulings: A-006 (clean-room controls, binding) and A-007 (Google-account pairing primary; QR never in tool output). QR tools removed from the MCP server.
- **Clean-room attestation (Phase 1), 2026-10-18:** No source on the do-not-open list in `docs/handoff/README.md` rule 1 has been opened, searched for, or retrieved in the course of this project. Renewed each phase.

## 2026-10-18 — public client bundle read (rule 2 allowed source)

- Fetched `https://messages.google.com/web/authentication` and its bundle `https://www.gstatic.com/_/messagesweb/_/js/k=messagesweb.mw.en_US.4-84y6pqYJM.O/am=AACAIQABACA/d=1/rs=AIp04d9V1dMnewToXdvGG9HxNT8PFbFzvQ/m=mw_b` (1,238,847 bytes; sha256 prefix `e310b645c7504f76`). This is the same build as SPEC.md; `"Ditto salt 1"` is at offset 1099375, matching SPEC [B@1099375]. Kept in scratch, outside the repo.
- Findings, cited by offset (pending spec-team constant review):
  - RegisterPhoneRelay key data [B@1083605 `vJ`, B@722929 `oOa`, B@723205 `tOa`]: request f4 = { f6 = { f1 = 2, f2 = SPKI DER } }. → Q-002
  - Browser details [B@1085900 `i7a`]: f5 = a client boolean flag, f6 = 2 if that flag is set, else 3 if a second flag is set, else 1. → Q-005
  - Pairing and Gaia auth providers send `X-Goog-Api-Key` from page-config constant `A16fYe` [B@811680 `_.AE`, used at B@1083605 and B@1094258]. → Q-003
  - `TACHYON_CLIENT_INFO` [B@973382] builds the AuthMessage ConfigVersion as f3, f4, f5 = a three-part date, f7 = 4, f9 = 6. With the A-001 live values, that maps Year→f3, Month→f4, Day→f5, V1→f7, V2→f9. → Q-001
  - Gaia pairing client [B@~1101337]: writes Google's "undocumented API … prohibited per the Google API Terms of Service" notice into a request field (f8). The bundle also contains a BotGuard/`Waa` anti-abuse client [B@~1090216]; whether Gaia pairing requires it was not established.
- Further bundle reading was stopped by a local tool-permission check. No API key values were recorded anywhere.

## 2026-10-18 — Google UKEY2 library (rule 2 allowed source, Apache-2.0)

- `https://github.com/google/ukey2` @ `10fc737aa901e873a3367e7e26b88eb01cd55d69`: `src/main/proto/ukey.proto` (Ukey2Message / ClientInit / ServerInit / ClientFinished field numbers, cipher P256_SHA512 = 100), `src/main/proto/securemessage.proto` (GenericPublicKey, EcP256PublicKey), `src/main/cpp/src/securegcm/d2d_crypto_ops.cc` (`kSalt`, the D2D salt). Protocol facts only; no code copied.
- A-012 (#14): SAPISIDHASH composition, cookie sources, origin rule → `src/session/googleAuth.ts`.
- Further reading of UKEY2 library internals was stopped by a local tool-permission check; open points went to Q-013 (#15).

## 2026-10-18 — A-013 part 2 (#15) and A-003 page-config follow-up (#3)

- Implemented from the spec team's written answers only: DeviceId shape, f36, registration choice, UKEY2 rounds (actions 44/45), HKDF table, rev1 ordering, page-config `MW_CONFIG` reader. Test vectors use locally generated random keys.
- Not exercised against Google's live servers. Live calls (runtime page read, RegisterPhoneRelay, pairing) wait on the owner's go-ahead.

## 2026-10-18 — live check (spec-team approved, A-015): public page config

- Unauthenticated GET of `https://messages.google.com/web/authentication` through `src/transport/pageConfig.ts`, no cookies. Logged only status and found/not-found.
- Result: **HTTP 400** with UA `grokbot-messages/0.0.1` and with Node's default UA; `MW_CONFIG` not present. The earlier 2026-10-18 fetch with a Chrome-style UA (bundle read) got 200. No browser-UA retry was made: impersonating a browser is an owner decision.
- Re-check with the pinned desktop-browser UA (A-003 part 3 ruling): `A16fYe` **found**; no value printed or stored.

## 2026-10-18 — A-018 / A-019 (#9, #10)

- Implemented the wire cipher (ct ‖ IV ‖ HMAC; empty plaintext passed through), the action 16/31/1/2/17 layouts, Conversation/Participant/Message/part decoders, push-update decoding (action 16 under the session ID; f7 → action 17), the stale-update filter, and `MessagesClient` (session activation, request matching, push routing).
- Late QR scans (spec-team note on ff3ec43): we rely on server-side pairing-key expiry; on the first live run, scan just after the link expires and log only whether route 14 arrived.
